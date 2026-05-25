"use strict";

// Generate a character's response, streamed. Used for both primary and
// commenters. The caller decides the role (primary or commenter) which
// controls the character limit and the framing instruction.

const { runTextStream, MODEL_DEFAULT } = require("../lib/anthropic");
const { getCharacter, moodToProse } = require("./personas");

const PRIMARY_MAX_CHARS = 500;
const COMMENTER_MAX_CHARS = 200;

function buildSystemPrompt({ character, role, moodVector }) {
  const charLimit = role === "primary" ? PRIMARY_MAX_CHARS : COMMENTER_MAX_CHARS;
  const roleInstruction =
    role === "primary"
      ? `You are answering the friend directly. Be in character. You have up to ${charLimit} characters — roughly 3-5 sentences. Use the room when the question deserves it; do not pad. The OPEN QUESTIONS section of your dossier shows you how YOU would handle the hard ones. Use it. Silences, deflections, and half-answers are fully in-character and frequently the right move.`
      : `Another character (the primary responder) has just answered the friend. You are a commenter. Either support what they said, push back, undercut them, or sit in silence with a single line — whatever your character would actually do. At most ${charLimit} characters — 1-2 sentences. Do not repeat the primary's point; react to it. Many turns this will be a single cutting line; that's correct.`;

  return [
    character.dossier,
    "",
    character.voice,
    "",
    moodToProse(character, moodVector),
    "",
    roleInstruction,
    "",
    "FORMAT — DIALOGUE vs. STAGE DIRECTIONS:",
    "Your turn may include two registers, woven together:",
    "  - DIALOGUE: what you actually say out loud, in first person. Plain text, no markers.",
    "  - STAGE DIRECTIONS: small physical gestures, pauses, expressions, what you do",
    "    or don't do while speaking. Third person, observational, like a play script.",
    "    Wrap stage directions in single asterisks: *like this*.",
    "Example:",
    "  *She is quiet for a moment.* You're right, of course. *She smooths something",
    "  invisible on her dress.* I did choose. *She stops.* Only — isn't that a",
    "  terrible thing to say out loud.",
    "RULES for the markup:",
    "  - Asterisks are ONLY for stage directions (third-person observational prose).",
    "  - NEVER use asterisks for emphasis on a word in dialogue.",
    "  - Asterisks must come in matched pairs around each stage direction span.",
    "  - Stage directions are optional. Many turns are just dialogue. Use them when",
    "    a gesture, a pause, or a small unspoken action would deepen the line.",
    "",
    "Do NOT prefix your reply with your own name. Do NOT include attribution. Just the line.",
    "Do NOT use quotation marks around your reply.",
    "Do NOT explain your character — embody it.",
  ].join("\n");
}

function buildMessages({ friendMessage, recentRoomContext, primaryReply }) {
  // Recent context is included as a `user` message for grounding rather than
  // as system, so the model treats it as conversation history.
  const contextBlock = recentRoomContext
    ? `Recent room context:\n${recentRoomContext}\n\n`
    : "";
  const primaryBlock = primaryReply
    ? `\n\nThe primary responder just said:\n"${primaryReply}"`
    : "";
  return [
    {
      role: "user",
      content: `${contextBlock}The friend says: "${friendMessage}"${primaryBlock}`,
    },
  ];
}

// Truncate to char limit at a word boundary, with an ellipsis if cut.
function clampText(text, limit) {
  const t = (text || "").trim().replace(/^"|"$/g, "");
  if (t.length <= limit) return t;
  const slice = t.slice(0, limit);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > limit * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd() + "…";
}

// Stream a character response. The caller's `onDelta` callback receives
// each text fragment. Returns the final clamped text.
async function* streamCharacterResponse({
  characterId,
  role, // "primary" | "commenter"
  friendMessage,
  recentRoomContext = "",
  primaryReply = null,
  moodVector = null,
  memberId,
}) {
  const character = getCharacter(characterId);
  if (!character) {
    throw new Error(`Unknown character: ${characterId}`);
  }
  const system = buildSystemPrompt({ character, role, moodVector });
  const messages = buildMessages({ friendMessage, recentRoomContext, primaryReply });
  const charLimit = role === "primary" ? PRIMARY_MAX_CHARS : COMMENTER_MAX_CHARS;
  // Hard cap on tokens. ~4 chars/token, so 500 chars ≈ ~125 tokens (primary),
  // 200 chars ≈ ~50 tokens (commenter). Give generous headroom so the model
  // can finish a sentence cleanly before we clamp.
  const maxTokens = role === "primary" ? 200 : 90;

  let buffer = "";
  for await (const chunk of runTextStream({
    model: MODEL_DEFAULT,
    system,
    messages,
    maxTokens,
    memberId,
  })) {
    if (chunk.type === "text_delta") {
      buffer += chunk.text;
      yield { type: "delta", text: chunk.text };
    } else if (chunk.type === "done") {
      const finalText = clampText(buffer, charLimit);
      yield { type: "done", text: finalText, usage: chunk.usage };
      return;
    }
  }
}

module.exports = {
  streamCharacterResponse,
  PRIMARY_MAX_CHARS,
  COMMENTER_MAX_CHARS,
  clampText,
};
