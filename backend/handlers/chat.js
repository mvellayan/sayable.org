"use strict";

// Streaming chat orchestrator. Lambda function URL with RESPONSE_STREAM
// invoke mode — the client opens a fetch() with streaming reads and receives
// SSE-style events as primary + commenters complete.
//
// Event protocol (one event per line, "event: <type>\ndata: <json>\n\n"):
//   event: turn-start       { turnId, primary, commenters }
//   event: typing-start     { characterId, role }
//   event: text-delta       { characterId, text }
//   event: message-complete { characterId, role, messageId, ts, text }
//   event: typing-stop      { characterId }
//   event: mood-update      { characterId, moodVector }       (after turn settles)
//   event: turn-end         { turnId }
//   event: error            { error }
//
// Each commenter is delayed (5-15s offset) so the room unfolds in real time
// rather than firing all at once.

const { verify } = require("../lib/jwt");
const { get, put, query, T } = require("../lib/ddb");
const { newId, isoNow } = require("../lib/ids");
const { routeMessage } = require("../ai/router");
const {
  streamCharacterResponse,
  PRIMARY_MAX_CHARS,
  COMMENTER_MAX_CHARS,
} = require("../ai/character");
const { updateMoodForTurn, getMoodVector } = require("../ai/mood");
const { getCharacter } = require("../ai/personas");

const ROOM_ID = "main";
const SESSION_SILENCE_MS = parseInt(
  process.env.SESSION_SILENCE_MS || `${4 * 60 * 60 * 1000}`,
  10
);

// Per-character commenter delays (ms). Different characters have different
// reaction speeds — Nick is slow and considered, Tom is fast and reactive.
const COMMENTER_DELAY_MS = {
  bettervibe: 4500,
  nick: 7000,
  daisy: 3500,
  tom: 2500,
  jordan: 5000,
  myrtle: 3000,
  george: 9000,
};

// --- auth --------------------------------------------------------------------

async function authorize(event) {
  const headers = event.headers || {};
  const authz =
    headers.authorization || headers.Authorization || headers.AUTHORIZATION;
  if (!authz || !authz.toLowerCase().startsWith("bearer ")) return null;
  const token = authz.slice(7).trim();
  try {
    const claims = await verify(token);
    const member = await get(T.members, { memberId: claims.sub });
    if (!member || member.status !== "active") return null;
    return member;
  } catch {
    return null;
  }
}

// --- session ----------------------------------------------------------------

async function getOrCreateSession() {
  // Single-room app — one active session at a time, keyed by ROOM_ID.
  const existing = await get(T.sessions, { sessionId: `session-${ROOM_ID}` });
  const now = Date.now();
  if (existing && existing.lastActivityAt) {
    const lastMs = new Date(existing.lastActivityAt).getTime();
    if (now - lastMs < SESSION_SILENCE_MS) {
      await put(T.sessions, { ...existing, lastActivityAt: isoNow() });
      return existing;
    }
  }
  // Stale or missing — open a new session. Mood state for the prior session
  // is preserved in DynamoDB; new session starts at baselines.
  const fresh = {
    sessionId: `session-${ROOM_ID}-${now}`,
    roomId: ROOM_ID,
    startedAt: isoNow(),
    lastActivityAt: isoNow(),
  };
  // Pointer row so we can always look up the current session.
  await put(T.sessions, {
    sessionId: `session-${ROOM_ID}`,
    pointerTo: fresh.sessionId,
    roomId: ROOM_ID,
    startedAt: fresh.startedAt,
    lastActivityAt: fresh.lastActivityAt,
  });
  await put(T.sessions, fresh);
  return fresh;
}

// --- recent context for prompts ---------------------------------------------

async function getRecentRoomContext(limit = 8) {
  const items = await query(T.messages, {
    KeyConditionExpression: "roomId = :r",
    ExpressionAttributeValues: { ":r": ROOM_ID },
    ScanIndexForward: false,
    Limit: limit,
  });
  items.reverse();
  if (items.length === 0) return "";
  return items
    .map((m) => {
      if (m.senderType === "friend") {
        return `[friend ${m.senderName}] ${m.text}`;
      }
      const c = getCharacter(m.senderId);
      return `[${c ? c.displayName : m.senderId}] ${m.text}`;
    })
    .join("\n");
}

// --- streaming helpers ------------------------------------------------------

function sse(type, data) {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

function writeEvent(stream, type, data) {
  stream.write(sse(type, data));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- orchestration ----------------------------------------------------------

async function streamCharacter({
  stream,
  characterId,
  role,
  friendMessage,
  recentRoomContext,
  primaryReply,
  sessionId,
  memberId,
  turnId,
}) {
  const moodVector = await getMoodVector(sessionId, characterId);

  writeEvent(stream, "typing-start", { characterId, role });

  let finalText = "";
  for await (const chunk of streamCharacterResponse({
    characterId,
    role,
    friendMessage,
    recentRoomContext,
    primaryReply,
    moodVector,
    memberId,
  })) {
    if (chunk.type === "delta") {
      writeEvent(stream, "text-delta", { characterId, text: chunk.text });
    } else if (chunk.type === "done") {
      finalText = chunk.text;
    }
  }

  const ts = isoNow();
  const messageId = newId("msg");
  const messageRow = {
    roomId: ROOM_ID,
    ts,
    messageId,
    sessionId,
    senderType: "character",
    senderId: characterId,
    characterRole: role,
    turnId,
    text: finalText,
  };
  await put(T.messages, messageRow);

  writeEvent(stream, "message-complete", {
    characterId,
    role,
    messageId,
    ts,
    text: finalText,
  });
  writeEvent(stream, "typing-stop", { characterId });

  return finalText;
}

// --- main handler -----------------------------------------------------------

async function chatHandler(event, responseStream) {
  // Send a small head event so Lambda flushes the response immediately.
  responseStream.setContentType("text/event-stream");

  try {
    const member = await authorize(event);
    if (!member) {
      writeEvent(responseStream, "error", { error: "Unauthorized" });
      responseStream.end();
      return;
    }

    const body = JSON.parse(event.body || "{}");
    const text = (body.text || "").toString().trim();
    if (!text) {
      writeEvent(responseStream, "error", { error: "text required" });
      responseStream.end();
      return;
    }

    const session = await getOrCreateSession();
    const sessionId = session.pointerTo || session.sessionId;
    const turnId = newId("turn");

    // Persist the friend's message first.
    const friendTs = isoNow();
    const friendMessage = {
      roomId: ROOM_ID,
      ts: friendTs,
      messageId: newId("msg"),
      sessionId,
      senderType: "friend",
      senderId: member.memberId,
      senderName: `${member.firstName} ${member.lastName || ""}`.trim(),
      text,
      turnId,
    };
    await put(T.messages, friendMessage);

    // Route.
    const recentRoomContext = await getRecentRoomContext(8);
    const route = await routeMessage({
      friendMessage: text,
      recentRoomContext,
      memberId: member.memberId,
    });

    writeEvent(responseStream, "turn-start", {
      turnId,
      primary: route.primary,
      commenters: route.commenters,
      friendMessage: friendMessage,
    });

    // Primary streams first.
    const primaryReply = await streamCharacter({
      stream: responseStream,
      characterId: route.primary,
      role: "primary",
      friendMessage: text,
      recentRoomContext,
      primaryReply: null,
      sessionId,
      memberId: member.memberId,
      turnId,
    });

    // Commenters: parallel kick-off, but each with its own delay so they
    // unfold in time rather than firing simultaneously.
    const commenterTexts = [];
    if (route.commenters.length > 0) {
      const commenterPromises = route.commenters.map(async (cid, idx) => {
        const baseDelay = COMMENTER_DELAY_MS[cid] || 5000;
        // Stagger by the commenter order, too, so they don't pile on the same instant.
        const delay = baseDelay + idx * 1500;
        await sleep(delay);
        const t = await streamCharacter({
          stream: responseStream,
          characterId: cid,
          role: "commenter",
          friendMessage: text,
          recentRoomContext,
          primaryReply,
          sessionId,
          memberId: member.memberId,
          turnId,
        });
        commenterTexts.push({ characterId: cid, text: t });
      });
      await Promise.all(commenterPromises);
    }

    // Fire-and-forget mood update (don't block turn-end on it; surface via SSE
    // when it lands).
    const exchangeText = [
      `[friend ${friendMessage.senderName}]: ${text}`,
      `[${route.primary}]: ${primaryReply}`,
      ...commenterTexts.map((c) => `[${c.characterId}]: ${c.text}`),
    ].join("\n");

    const participating = [route.primary, ...route.commenters];
    updateMoodForTurn({
      sessionId,
      characterIds: participating,
      exchangeText,
      memberId: member.memberId,
    })
      .then(async () => {
        for (const cid of participating) {
          const v = await getMoodVector(sessionId, cid);
          writeEvent(responseStream, "mood-update", { characterId: cid, moodVector: v });
        }
        writeEvent(responseStream, "turn-end", { turnId });
        responseStream.end();
      })
      .catch((e) => {
        console.error("mood_update_chain_failed", e);
        writeEvent(responseStream, "turn-end", { turnId });
        responseStream.end();
      });
  } catch (e) {
    console.error("chat_handler_error", e);
    try {
      writeEvent(responseStream, "error", { error: e?.message || "Internal error" });
      responseStream.end();
    } catch {
      // Stream already closed.
    }
  }
}

// AWS Lambda response-streaming wrapper. `awslambda.streamifyResponse` is a
// runtime-provided global in Node 20 Lambdas configured for RESPONSE_STREAM
// invoke mode.
exports.handler =
  typeof awslambda !== "undefined" && awslambda.streamifyResponse
    ? awslambda.streamifyResponse(chatHandler)
    : chatHandler;
