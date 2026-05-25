"use strict";

// Main REST API. The streaming chat endpoint lives in handlers/chat.js
// (separate Lambda function URL because API Gateway doesn't stream).
//
// Routes:
//   GET    /me                       — current member
//   GET    /characters               — list all characters
//   GET    /messages                 — list recent messages (paginated)
//   POST   /messages                 — non-streaming fallback for posting a message
//   POST   /me/avatar-upload-url     — pre-signed PUT for friend's own avatar
//   POST   /admin/members/:id/approve — admin: approve a pending signup
//   POST   /admin/members/:id/deny    — admin: deny a pending signup
//   GET    /admin/members            — admin: list all members
//   GET    /admin/usage              — admin: usage / cost summary

const { Router } = require("../lib/router");
const {
  ok,
  badRequest,
  unauthorized,
  notFound,
  forbidden,
} = require("../lib/response");
const { get, put, query, scan, T } = require("../lib/ddb");
const { newId, isoNow } = require("../lib/ids");
const {
  getCallerFromEvent,
  requireAuth,
  requireAdmin,
} = require("../lib/auth");
const { CHARACTERS, CHARACTER_IDS } = require("../ai/personas");
const { sanitizeMember } = require("./auth");

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const {
  getSignedUrl,
} = require("@aws-sdk/s3-request-presigner");

const s3 = new S3Client({});
const AVATARS_BUCKET = process.env.AVATARS_BUCKET;
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
// Friend avatars live in a separate S3 bucket (AvatarsBucket) so they survive
// frontend redeploys. The bucket is public-read but is NOT behind CloudFront —
// CloudFront only fronts the FrontendBucket. So we serve friend avatars from
// the direct S3 URL. Character avatars stay at /avatars/characters/ under
// CloudFront because they're baked into the Vite build.
const AVATARS_PUBLIC_BASE = AVATARS_BUCKET
  ? `https://${AVATARS_BUCKET}.s3.${AWS_REGION}.amazonaws.com`
  : "";

const ROOM_ID = "main";

const router = new Router();

// --- characters --------------------------------------------------------------

function publicCharacter(c) {
  return {
    characterId: c.characterId,
    displayName: c.displayName,
    avatarUrl: c.avatarPath, // served from frontend bucket via CloudFront
    accentHex: c.accentHex,
    moodDimensions: c.moodDimensions,
  };
}

router.get("/characters", async ({ event }) => {
  const caller = await getCallerFromEvent(event);
  requireAuth(caller);

  // Try DynamoDB first; fall back to the static personas.js list if the table
  // hasn't been seeded yet (admin/bootstrap-characters.ts populates it).
  const dbRows = await scan(T.characters);
  if (dbRows.length === CHARACTER_IDS.length) {
    return ok({ characters: dbRows.map(publicCharacter) });
  }
  const fallback = CHARACTER_IDS.map((id) => publicCharacter(CHARACTERS[id]));
  return ok({ characters: fallback });
});

// --- messages ----------------------------------------------------------------

router.get("/messages", async ({ event }) => {
  const caller = await getCallerFromEvent(event);
  requireAuth(caller);

  const qs = event.queryStringParameters || {};
  const limit = Math.min(parseInt(qs.limit || "100", 10) || 100, 500);
  const before = qs.before || null;

  // Most recent first, then reverse client-side. Single PK = ROOM_ID.
  const params = {
    KeyConditionExpression: "roomId = :r",
    ExpressionAttributeValues: { ":r": ROOM_ID },
    ScanIndexForward: false,
    Limit: limit,
  };
  if (before) {
    params.KeyConditionExpression += " AND ts < :b";
    params.ExpressionAttributeValues[":b"] = before;
  }
  const items = await query(T.messages, params);
  // Return ascending (oldest first) for natural chat order.
  items.reverse();
  return ok({ messages: items });
});

// Non-streaming fallback. Real-time chat goes through the chatFn endpoint;
// this is here for testing without SSE plumbing.
router.post("/messages", async ({ body, event }) => {
  const caller = await getCallerFromEvent(event);
  requireAuth(caller);

  const text = (body.text || "").toString().trim();
  if (!text) return badRequest("text required");

  const message = {
    roomId: ROOM_ID,
    ts: isoNow(),
    messageId: newId("msg"),
    senderType: "friend",
    senderId: caller.member.memberId,
    senderName: `${caller.member.firstName} ${caller.member.lastName || ""}`.trim(),
    text,
  };
  await put(T.messages, message);
  return ok({ message });
});

// --- avatar upload -----------------------------------------------------------

router.post("/me/avatar-upload-url", async ({ body, event }) => {
  const caller = await getCallerFromEvent(event);
  requireAuth(caller);

  const ext = ((body.ext || "jpg") + "").toLowerCase().replace(/[^a-z]/g, "");
  if (!["jpg", "jpeg", "png", "webp"].includes(ext)) {
    return badRequest("ext must be jpg|png|webp");
  }
  const key = `friends/${caller.member.memberId}.${ext}`;
  const cmd = new PutObjectCommand({
    Bucket: AVATARS_BUCKET,
    Key: key,
    ContentType: `image/${ext === "jpg" ? "jpeg" : ext}`,
  });
  const url = await getSignedUrl(s3, cmd, { expiresIn: 300 });
  const publicUrl = `${AVATARS_PUBLIC_BASE}/${key}`;

  // Persist the avatarUrl on the member so we have it after upload.
  await put(T.members, {
    ...caller.member,
    avatarUrl: publicUrl,
    updatedAt: isoNow(),
  });

  return ok({ uploadUrl: url, avatarUrl: publicUrl });
});

// --- admin -------------------------------------------------------------------

router.get("/admin/members", async ({ event }) => {
  const caller = await getCallerFromEvent(event);
  requireAdmin(caller);
  const all = await scan(T.members);
  all.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  return ok({ members: all.map(sanitizeMember) });
});

router.post("/admin/members/:id/approve", async ({ params, event }) => {
  const caller = await getCallerFromEvent(event);
  requireAdmin(caller);
  const member = await get(T.members, { memberId: params.id });
  if (!member) return notFound("Member not found");
  const updated = { ...member, status: "active", updatedAt: isoNow() };
  await put(T.members, updated);
  return ok({ member: sanitizeMember(updated) });
});

router.post("/admin/members/:id/deny", async ({ params, event }) => {
  const caller = await getCallerFromEvent(event);
  requireAdmin(caller);
  const member = await get(T.members, { memberId: params.id });
  if (!member) return notFound("Member not found");
  const updated = { ...member, status: "denied", updatedAt: isoNow() };
  await put(T.members, updated);
  return ok({ member: sanitizeMember(updated) });
});

router.get("/admin/usage", async ({ event }) => {
  const caller = await getCallerFromEvent(event);
  requireAdmin(caller);
  const members = await scan(T.members);
  const summary = members
    .map((m) => ({
      memberId: m.memberId,
      name: `${m.firstName} ${m.lastName || ""}`.trim(),
      email: m.email,
      usage: m.usage || null,
    }))
    .filter((s) => s.usage);
  const totalCost = summary.reduce(
    (acc, s) => acc + (s.usage?.totals?.costUsd || 0),
    0
  );
  return ok({ members: summary, totalCostUsd: totalCost });
});

// --- handler -----------------------------------------------------------------

exports.handler = async (event) => {
  try {
    return await router.handle(event);
  } catch (e) {
    if (e?.statusCode) {
      return {
        statusCode: e.statusCode,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: e.message }),
      };
    }
    console.error("api_handler_error", e);
    return {
      statusCode: 500,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
