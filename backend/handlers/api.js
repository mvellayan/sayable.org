"use strict";

// Derived from the gatsby scaffold (Development/gatsby); see NOTICE.md.
// BetterVibe REST API (apiFn). Multi-tenant relationships/threads/messages and
// the send pipeline with the safety hard-stop. Private draft review streaming
// lives in handlers/coach.js (separate Lambda function URL — streaming).
//
// Phase 1 routes:
//   POST /relationships                                   create a relationship
//   GET  /relationships                                   list mine
//   POST /relationships/:rid/invite                       create partner invite link
//   POST /invites/:inviteId/accept                        accept (asymmetric onboarding)
//   POST /relationships/:rid/threads                      create a thread
//   GET  /relationships/:rid/threads                      list threads
//   GET  /relationships/:rid/threads/:tid/messages        list/poll SENT messages
//   GET  /relationships/:rid/threads/:tid/draft           my private draft
//   POST /relationships/:rid/threads/:tid/draft           save my private draft
//   POST /relationships/:rid/threads/:tid/send            send pipeline + safety
//
// Deferred (later phases): profiles §1, observations/patterns §10, mediator §9,
// feedback §20, admin §19, deletion §17.

const { Router } = require("../lib/router");
const { ok, badRequest, notFound } = require("../lib/response");
const {
  get,
  put,
  update,
  del,
  query,
  T,
  transactWrite,
  isConditionalCancel,
} = require("../lib/ddb");
const { newId, isoNow } = require("../lib/ids");
const { getCallerFromEvent, requireAuth } = require("../lib/auth");
const { assertMember, listSharedMessages } = require("../lib/access");
const { classifyMessage, SAFETY_MESSAGE } = require("../ai/safety");

const router = new Router();

async function caller(event) {
  const c = await getCallerFromEvent(event);
  requireAuth(c); // throws 401
  return c.user;
}

// --- relationships ----------------------------------------------------------

router.post("/relationships", async ({ event, body }) => {
  const user = await caller(event);
  const relationshipId = newId("rel");
  const rel = {
    relationshipId,
    userAId: user.userId,
    userBId: null,
    type: (body.type || "couple").toString(),
    label: (body.label || "Us").toString(),
    status: "active",
    safetyState: "calm",
    createdAt: isoNow(),
    updatedAt: isoNow(),
  };
  await put(T.relationships, rel);
  await put(T.relationshipMembers, {
    userId: user.userId,
    relationshipId,
    role: "owner",
    joinedAt: isoNow(),
  });
  return ok({ relationship: rel });
});

router.get("/relationships", async ({ event }) => {
  const user = await caller(event);
  const members = await query(T.relationshipMembers, {
    KeyConditionExpression: "userId = :u",
    ExpressionAttributeValues: { ":u": user.userId },
  });
  const rels = await Promise.all(
    members.map((m) => get(T.relationships, { relationshipId: m.relationshipId }))
  );
  return ok({ relationships: rels.filter(Boolean) });
});

// --- invites (asymmetric onboarding) ----------------------------------------

router.post("/relationships/:rid/invite", async ({ event, params }) => {
  const user = await caller(event);
  await assertMember(user.userId, params.rid); // throws 403
  const inviteId = newId("inv");
  const ttlDays = parseInt(process.env.INVITE_TTL_DAYS || "14", 10);
  const expiresAt = Math.floor((Date.now() + ttlDays * 86400 * 1000) / 1000);
  await put(T.relationshipInvites, {
    inviteId,
    relationshipId: params.rid,
    createdBy: user.userId,
    status: "pending",
    createdAt: isoNow(),
    expiresAt,
  });
  const base = process.env.APP_URL || "";
  return ok({ inviteId, link: `${base}/invite/${inviteId}`, expiresAt });
});

// Single-use, expiring (TTL), relationship-bound. The reluctant partner taps a
// link → one step to join.
router.post("/invites/:inviteId/accept", async ({ event, params }) => {
  const user = await caller(event);
  const invite = await get(T.relationshipInvites, { inviteId: params.inviteId });
  if (!invite) return badRequest("Invite not found");
  if (invite.status !== "pending") return badRequest("Invite already used");
  if (invite.expiresAt && invite.expiresAt < Math.floor(Date.now() / 1000)) {
    return badRequest("Invite expired");
  }
  const rel = await get(T.relationships, { relationshipId: invite.relationshipId });
  if (!rel) return notFound("Relationship not found");
  if (rel.userAId === user.userId) return badRequest("You created this relationship");

  const already = await get(T.relationshipMembers, {
    userId: user.userId,
    relationshipId: rel.relationshipId,
  });
  if (!already) {
    if (rel.userBId && rel.userBId !== user.userId) {
      return badRequest("This relationship already has two members");
    }
    await put(T.relationshipMembers, {
      userId: user.userId,
      relationshipId: rel.relationshipId,
      role: "member",
      joinedAt: isoNow(),
    });
    await update(
      T.relationships,
      { relationshipId: rel.relationshipId },
      {
        UpdateExpression: "SET userBId = :u, updatedAt = :now",
        ExpressionAttributeValues: { ":u": user.userId, ":now": isoNow() },
      }
    );
  }
  // Mark single-use.
  await update(
    T.relationshipInvites,
    { inviteId: params.inviteId },
    {
      UpdateExpression: "SET #s = :a, acceptedBy = :u, acceptedAt = :now",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":a": "accepted",
        ":u": user.userId,
        ":now": isoNow(),
      },
    }
  );
  return ok({ relationship: { ...rel, userBId: rel.userBId || user.userId } });
});

// --- threads ----------------------------------------------------------------

router.post("/relationships/:rid/threads", async ({ event, params, body }) => {
  const user = await caller(event);
  await assertMember(user.userId, params.rid);
  const thread = {
    relationshipId: params.rid,
    threadId: newId("thr"),
    name: (body.name || "Untitled").toString(),
    goal: body.goal ? body.goal.toString() : null,
    status: "calm",
    safetyState: "calm",
    createdAt: isoNow(),
    lastActivityAt: isoNow(),
  };
  await put(T.threads, thread);
  return ok({ thread });
});

router.get("/relationships/:rid/threads", async ({ event, params }) => {
  const user = await caller(event);
  await assertMember(user.userId, params.rid);
  const threads = await query(T.threads, {
    KeyConditionExpression: "relationshipId = :r",
    ExpressionAttributeValues: { ":r": params.rid },
  });
  return ok({ threads });
});

// --- messages (shared, sent-only) -------------------------------------------

router.get(
  "/relationships/:rid/threads/:tid/messages",
  async ({ event, params }) => {
    const user = await caller(event);
    await assertMember(user.userId, params.rid);
    const thread = await get(T.threads, {
      relationshipId: params.rid,
      threadId: params.tid,
    });
    if (!thread) return notFound("Thread not found");
    const messages = await listSharedMessages(params.tid, 200);
    return ok({
      messages,
      safetyState: thread.safetyState || "calm",
      threadStatus: thread.status || "calm",
    });
  }
);

// --- private draft (owner-only; access.js guards private reads elsewhere) ----

router.get(
  "/relationships/:rid/threads/:tid/draft",
  async ({ event, params }) => {
    const user = await caller(event);
    await assertMember(user.userId, params.rid);
    const draft = await get(T.drafts, { userId: user.userId, threadId: params.tid });
    return ok({ draft: draft || null });
  }
);

router.post(
  "/relationships/:rid/threads/:tid/draft",
  async ({ event, params, body }) => {
    const user = await caller(event);
    await assertMember(user.userId, params.rid);
    await put(T.drafts, {
      userId: user.userId,
      threadId: params.tid,
      text: (body.text || "").toString(),
      updatedAt: isoNow(),
    });
    return ok({ ok: true });
  }
);

// --- send pipeline + safety hard-stop ---------------------------------------

router.post(
  "/relationships/:rid/threads/:tid/send",
  async ({ event, params, body }) => {
    const user = await caller(event);
    await assertMember(user.userId, params.rid);

    const thread = await get(T.threads, {
      relationshipId: params.rid,
      threadId: params.tid,
    });
    if (!thread) return notFound("Thread not found");
    if (thread.safetyState === "ended") {
      return ok({ status: "ended", safetyMessage: SAFETY_MESSAGE });
    }

    const text = (body.text || "").toString().trim();
    if (!text) return badRequest("Message text required");

    // 1. Safety classify (fast model) with a little thread context.
    const recent = await listSharedMessages(params.tid, 8);
    const recentContext = recent
      .map((m) => `[${m.senderId === user.userId ? "me" : "partner"}] ${m.text}`)
      .join("\n");
    const verdict = await classifyMessage({
      text,
      recentContext,
      userId: user.userId,
    });

    if (verdict.danger) {
      await update(
        T.threads,
        { relationshipId: params.rid, threadId: params.tid },
        {
          UpdateExpression: "SET safetyState = :e, updatedAt = :now",
          ExpressionAttributeValues: { ":e": "ended", ":now": isoNow() },
        }
      );
      await put(T.safetyEvents, {
        relationshipId: params.rid,
        ts: isoNow(),
        threadId: params.tid,
        userId: user.userId,
        category: verdict.category,
        rationale: verdict.rationale,
      });
      return ok({ status: "ended", safetyMessage: SAFETY_MESSAGE });
    }

    // 2. Safe — write the message atomically iff the thread is not 'ended'.
    //    The conditional Update closes the race with a concurrent safety stop
    //    (DDB has no cross-table transaction otherwise). Failure mode #2.
    const ts = isoNow();
    const messageRow = {
      threadId: params.tid,
      ts,
      messageId: newId("msg"),
      relationshipId: params.rid,
      senderId: user.userId,
      text,
    };
    try {
      await transactWrite([
        {
          Update: {
            TableName: T.threads,
            Key: { relationshipId: params.rid, threadId: params.tid },
            UpdateExpression: "SET lastActivityAt = :now",
            ConditionExpression:
              "attribute_exists(relationshipId) AND safetyState <> :ended",
            ExpressionAttributeValues: { ":now": ts, ":ended": "ended" },
          },
        },
        { Put: { TableName: T.messages, Item: messageRow } },
      ]);
    } catch (e) {
      if (isConditionalCancel(e)) {
        return ok({ status: "ended", safetyMessage: SAFETY_MESSAGE });
      }
      throw e;
    }

    // Clear the now-sent private draft (best-effort).
    try {
      await del(T.drafts, { userId: user.userId, threadId: params.tid });
    } catch (_) {
      /* non-fatal */
    }

    return ok({ status: "sent", message: messageRow });
  }
);

exports.handler = async (event) => router.handle(event);
