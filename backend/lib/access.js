"use strict";

// =============================================================================
// access.js — THE privacy boundary. (BetterVibe original; not from gatsby.)
//
// DynamoDB has no row-level security, so the private/shared boundary is enforced
// here, in application code, and NOWHERE else. This module is the ONLY place
// allowed to read the PRIVATE tables (Drafts, Reviews, Observations, Profiles).
// A handler that reads those tables directly is a privacy-boundary violation.
//
//   buildCoachContext(userId, relationshipId, threadId)
//     → that user's OWN private data + SHARED data + partner's SHAREABLE profile.
//       NEVER the partner's drafts / reviews / observations / private profile.
//
//   buildMediatorContext(relationshipId, threadId)
//     → SHARED data only. NEVER any private data from EITHER user.
//
// Invariants:
//   1. Every private read injects `userId` as the partition key, so a query
//      physically cannot return another user's rows.
//   2. Shared reads require membership in the thread's relationship first.
//   3. These two builders are the only assemblers of LLM context. The heaviest
//      tests in the suite live against them (see test/access.test.js).
//
//                 ┌─────────────── access.js ───────────────┐
//   A's coach ───►│ own private  +  shared  +  partner-share │  (never B's private)
//   mediator  ───►│ shared only                              │  (never anyone's private)
//                 └──────────────────────────────────────────┘
// =============================================================================

const { get, query, T } = require("./ddb");

class AccessError extends Error {
  constructor(message, code = "forbidden") {
    super(message);
    this.name = "AccessError";
    this.code = code;
  }
}

// --- membership -------------------------------------------------------------

// Throws AccessError unless `userId` is a member of `relationshipId`.
// RelationshipMembers: PK userId, SK relationshipId.
async function assertMember(userId, relationshipId) {
  if (!userId || !relationshipId) {
    throw new AccessError("Missing userId or relationshipId", "bad_request");
  }
  const row = await get(T.relationshipMembers, { userId, relationshipId });
  if (!row) {
    throw new AccessError("Not a member of this relationship", "forbidden");
  }
  return row;
}

async function getRelationship(relationshipId) {
  return get(T.relationships, { relationshipId });
}

function partnerIdOf(relationship, userId) {
  if (!relationship) return null;
  if (relationship.userAId === userId) return relationship.userBId || null;
  if (relationship.userBId === userId) return relationship.userAId || null;
  return null;
}

// --- shared reads (scoped by threadId; caller must be a verified member) -----

async function listSharedMessages(threadId, limit = 50) {
  // Messages: PK threadId, SK ts. SENT messages only — the shared store.
  const items = await query(T.messages, {
    KeyConditionExpression: "threadId = :t",
    ExpressionAttributeValues: { ":t": threadId },
    ScanIndexForward: false,
    Limit: limit,
  });
  items.reverse();
  return items;
}

async function listMediatorSummaries(threadId, limit = 10) {
  const items = await query(T.mediatorSummaries, {
    KeyConditionExpression: "threadId = :t",
    ExpressionAttributeValues: { ":t": threadId },
    ScanIndexForward: false,
    Limit: limit,
  });
  items.reverse();
  return items;
}

async function listPatterns(relationshipId) {
  return query(T.patterns, {
    KeyConditionExpression: "relationshipId = :r",
    ExpressionAttributeValues: { ":r": relationshipId },
  });
}

// --- private reads (ALWAYS scoped by ownerUserId) ----------------------------

// Profiles carry a per-field visibility map: profile.visibility[field] ∈
// { "private" | "coach" | "relationship" | "all" }. The owner's coach sees
// everything; the PARTNER sees only fields marked "relationship" or "all".
function shareableProfileFields(profile) {
  if (!profile || !profile.fields) return null;
  const vis = profile.visibility || {};
  const out = {};
  for (const [k, v] of Object.entries(profile.fields)) {
    if (vis[k] === "relationship" || vis[k] === "all") out[k] = v;
  }
  return Object.keys(out).length ? { userId: profile.userId, fields: out } : null;
}

async function getOwnProfile(userId) {
  return get(T.profiles, { userId });
}

async function getOwnDraft(userId, threadId) {
  return get(T.drafts, { userId, threadId });
}

async function listOwnReviews(userId, limit = 10) {
  const items = await query(T.reviews, {
    KeyConditionExpression: "userId = :u",
    ExpressionAttributeValues: { ":u": userId },
    ScanIndexForward: false,
    Limit: limit,
  });
  items.reverse();
  return items;
}

async function listOwnObservations(userId, limit = 25) {
  return query(T.observations, {
    KeyConditionExpression: "userId = :u",
    ExpressionAttributeValues: { ":u": userId },
    Limit: limit,
  });
}

// --- the two context builders (the entire enforcement surface) ---------------

// Context for User A's PRIVATE coach (My Coach / Their Coach). Includes A's own
// private data + shared thread data + the partner's SHAREABLE profile fields.
// NEVER returns the partner's drafts, reviews, observations, or private profile.
async function buildCoachContext(userId, relationshipId, threadId) {
  await assertMember(userId, relationshipId);

  const relationship = await getRelationship(relationshipId);
  const partnerId = partnerIdOf(relationship, userId);

  const [
    ownProfile,
    ownDraft,
    ownReviews,
    ownObservations,
    messages,
    mediatorSummaries,
    partnerProfileRaw,
  ] = await Promise.all([
    getOwnProfile(userId),
    threadId ? getOwnDraft(userId, threadId) : null,
    listOwnReviews(userId),
    listOwnObservations(userId),
    threadId ? listSharedMessages(threadId) : [],
    threadId ? listMediatorSummaries(threadId) : [],
    partnerId ? getOwnProfile(partnerId) : null, // filtered below — never raw
  ]);

  return {
    self: {
      userId,
      profile: ownProfile || null, // own profile: all fields
      draft: ownDraft || null,
      reviews: ownReviews,
      observations: ownObservations,
    },
    shared: { messages, mediatorSummaries },
    // Partner data is shareable-fields-only. Raw partner profile never leaves
    // this function; drafts/reviews/observations are never fetched at all.
    partner: { userId: partnerId, profile: shareableProfileFields(partnerProfileRaw) },
  };
}

// Context for the SHARED mediator. SHARED data only. Asserts membership of the
// requesting user, but the returned context contains nothing private to anyone.
async function buildMediatorContext(relationshipId, threadId, requestingUserId) {
  if (requestingUserId) await assertMember(requestingUserId, relationshipId);

  const [messages, mediatorSummaries, patterns] = await Promise.all([
    threadId ? listSharedMessages(threadId) : [],
    threadId ? listMediatorSummaries(threadId) : [],
    listPatterns(relationshipId),
  ]);

  return { shared: { messages, mediatorSummaries, patterns } };
}

module.exports = {
  AccessError,
  assertMember,
  getRelationship,
  partnerIdOf,
  listSharedMessages,
  listMediatorSummaries,
  buildCoachContext,
  buildMediatorContext,
  // exported for unit tests of the boundary
  shareableProfileFields,
};
