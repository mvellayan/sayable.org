"use strict";

// THE privacy-boundary tests (eng-review CRITICAL #1). Proves access.js never
// leaks one partner's private data to the other, and the mediator sees nothing
// private. Uses an in-memory DynamoDB stub — no AWS, no network.
//
// Run: node --test   (from backend/)

// 1) Populate table-name env BEFORE requiring ddb so T has distinct names.
const TABLES = {
  USERS_TABLE: "users",
  OTP_TABLE: "otp",
  CONFIG_TABLE: "config",
  RELATIONSHIPS_TABLE: "relationships",
  RELATIONSHIP_MEMBERS_TABLE: "relMembers",
  RELATIONSHIP_INVITES_TABLE: "relInvites",
  THREADS_TABLE: "threads",
  MESSAGES_TABLE: "messages",
  MEDIATOR_SUMMARIES_TABLE: "mediatorSummaries",
  PATTERNS_TABLE: "patterns",
  DRAFTS_TABLE: "drafts",
  REVIEWS_TABLE: "reviews",
  OBSERVATIONS_TABLE: "observations",
  PROFILES_TABLE: "profiles",
  USAGE_TABLE: "usage",
  FEEDBACK_TABLE: "feedback",
  SAFETY_EVENTS_TABLE: "safetyEvents",
};
for (const [k, v] of Object.entries(TABLES)) process.env[k] = v;

const test = require("node:test");
const assert = require("node:assert/strict");

// 2) Stub the ddb module's get/query with an in-memory store BEFORE requiring access.
const ddb = require("../lib/ddb");

const store = {}; // table -> array of items
function seed(table, items) {
  store[table] = (store[table] || []).concat(items);
}
function reset() {
  for (const k of Object.keys(store)) delete store[k];
}

ddb.get = async (table, key) => {
  const rows = store[table] || [];
  return (
    rows.find((r) => Object.entries(key).every(([k, v]) => r[k] === v)) || null
  );
};
ddb.query = async (table, params) => {
  const rows = store[table] || [];
  // Parse "ATTR = :v" (first key condition term).
  const m = /([A-Za-z0-9_]+)\s*=\s*(:[A-Za-z0-9_]+)/.exec(
    params.KeyConditionExpression || ""
  );
  if (!m) return rows.slice();
  const attr = m[1];
  const val = (params.ExpressionAttributeValues || {})[m[2]];
  let out = rows.filter((r) => r[attr] === val);
  if (params.ScanIndexForward === false) out = out.slice().reverse();
  if (params.Limit) out = out.slice(0, params.Limit);
  return out;
};

const access = require("../lib/access");

// --- fixture: relationship REL between userA and userB, thread T1 -----------
function seedRelationship() {
  reset();
  seed("relationships", [
    { relationshipId: "REL", userAId: "A", userBId: "B" },
  ]);
  seed("relMembers", [
    { userId: "A", relationshipId: "REL" },
    { userId: "B", relationshipId: "REL" },
  ]);
  // Profiles: A marks one field shareable, one private. B likewise.
  seed("profiles", [
    {
      userId: "A",
      fields: { calms_me: "A: a walk", secret_fear: "A: abandonment" },
      visibility: { calms_me: "relationship", secret_fear: "private" },
    },
    {
      userId: "B",
      fields: { calms_me: "B: quiet", secret_fear: "B: failure" },
      visibility: { calms_me: "relationship", secret_fear: "private" },
    },
  ]);
  // PRIVATE rows for each user.
  seed("drafts", [
    { userId: "A", threadId: "T1", text: "A private draft" },
    { userId: "B", threadId: "T1", text: "B private draft" },
  ]);
  seed("reviews", [
    { userId: "A", reviewId: "rA", reviewText: "A private review" },
    { userId: "B", reviewId: "rB", reviewText: "B private review" },
  ]);
  seed("observations", [
    { userId: "A", observationId: "oA", text: "A private observation" },
    { userId: "B", observationId: "oB", text: "B private observation" },
  ]);
  // SHARED.
  seed("messages", [
    { threadId: "T1", ts: "1", senderId: "A", text: "hello from A" },
    { threadId: "T1", ts: "2", senderId: "B", text: "hello from B" },
  ]);
  seed("mediatorSummaries", [{ threadId: "T1", ts: "1", text: "summary" }]);
  seed("patterns", [{ relationshipId: "REL", patternId: "p1", name: "circular" }]);
}

// Deep scan for a forbidden substring anywhere in an object graph.
function jsonContains(obj, needle) {
  return JSON.stringify(obj).includes(needle);
}

test("buildCoachContext includes the caller's OWN private + shared data", async () => {
  seedRelationship();
  const ctx = await access.buildCoachContext("A", "REL", "T1");
  assert.equal(ctx.self.draft.text, "A private draft");
  assert.equal(ctx.self.reviews[0].reviewText, "A private review");
  assert.equal(ctx.self.observations[0].text, "A private observation");
  assert.equal(ctx.shared.messages.length, 2);
});

test("CRITICAL: buildCoachContext NEVER exposes the partner's private data", async () => {
  seedRelationship();
  const ctx = await access.buildCoachContext("A", "REL", "T1");
  // B's private rows must appear nowhere in A's coach context.
  assert.ok(!jsonContains(ctx, "B private draft"), "leaked B draft");
  assert.ok(!jsonContains(ctx, "B private review"), "leaked B review");
  assert.ok(!jsonContains(ctx, "B private observation"), "leaked B observation");
  assert.ok(!jsonContains(ctx, "B: failure"), "leaked B private profile field");
});

test("CRITICAL: partner profile is shareable-fields-only", async () => {
  seedRelationship();
  const ctx = await access.buildCoachContext("A", "REL", "T1");
  // A may see B's shareable field, never B's private one.
  assert.equal(ctx.partner.userId, "B");
  assert.equal(ctx.partner.profile.fields.calms_me, "B: quiet");
  assert.equal(ctx.partner.profile.fields.secret_fear, undefined);
});

test("CRITICAL: buildMediatorContext contains NO private data from either user", async () => {
  seedRelationship();
  const ctx = await access.buildMediatorContext("REL", "T1", "A");
  assert.equal(ctx.shared.messages.length, 2);
  assert.equal(ctx.shared.patterns.length, 1);
  for (const needle of [
    "A private draft",
    "B private draft",
    "A private review",
    "B private review",
    "A private observation",
    "B private observation",
    "secret_fear",
  ]) {
    assert.ok(!jsonContains(ctx, needle), `mediator leaked: ${needle}`);
  }
});

test("CRITICAL: a non-member cannot build context", async () => {
  seedRelationship();
  await assert.rejects(
    () => access.buildCoachContext("STRANGER", "REL", "T1"),
    /Not a member/
  );
  await assert.rejects(
    () => access.buildMediatorContext("REL", "T1", "STRANGER"),
    /Not a member/
  );
});

test("getCurrentObservation is owner-keyed and never returns the partner's", async () => {
  seedRelationship();
  // Each user has a CURRENT observation for the same thread (same SK, different PK).
  seed("observations", [
    { userId: "A", observationId: "cur#T1", text: "A current observation" },
    { userId: "B", observationId: "cur#T1", text: "B current observation" },
  ]);
  const a = await access.getCurrentObservation("A", "T1");
  assert.equal(a.text, "A current observation");
  const b = await access.getCurrentObservation("B", "T1");
  assert.equal(b.text, "B current observation");
  // A's coach context surfaces A's own observations, never B's current one.
  const ctx = await access.buildCoachContext("A", "REL", "T1");
  assert.ok(
    !jsonContains(ctx, "B current observation"),
    "leaked B current observation into A's coach context"
  );
  // And it never lands in the shared mediator context.
  const med = await access.buildMediatorContext("REL", "T1", "A");
  assert.ok(
    !jsonContains(med, "current observation"),
    "current observation leaked into the shared mediator context"
  );
});

test("getCurrentObservation tolerates missing ids without throwing", async () => {
  reset();
  assert.equal(await access.getCurrentObservation(null, "T1"), null);
  assert.equal(await access.getCurrentObservation("A", null), null);
  assert.equal(await access.getCurrentObservation("A", "T-none"), null);
});

test("shareableProfileFields drops private fields and empty profiles", () => {
  assert.equal(access.shareableProfileFields(null), null);
  const out = access.shareableProfileFields({
    userId: "X",
    fields: { a: "1", b: "2" },
    visibility: { a: "all", b: "private" },
  });
  assert.deepEqual(out, { userId: "X", fields: { a: "1" } });
});
