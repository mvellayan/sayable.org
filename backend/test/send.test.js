"use strict";

// Send-pipeline tests (eng-review CRITICAL regression: /send was modified to a
// two-phase flow and had ZERO tests). Covers the five phase paths, the safety
// hard-stop authority on every commit path, the safety-end race, and the
// moderator beat (on-request + auto-cadence) writing SHARED-only.
//
// In-memory DynamoDB + stubbed classifier/moderator — no AWS, no Anthropic.
// Run: node --test   (from backend/)

// 1) Table-name env BEFORE requiring ddb so T has names.
const TABLES = {
  USERS_TABLE: "users", OTP_TABLE: "otp", CONFIG_TABLE: "config",
  RELATIONSHIPS_TABLE: "relationships", RELATIONSHIP_MEMBERS_TABLE: "relMembers",
  RELATIONSHIP_INVITES_TABLE: "relInvites", THREADS_TABLE: "threads",
  MESSAGES_TABLE: "messages", MEDIATOR_SUMMARIES_TABLE: "mediatorSummaries",
  PATTERNS_TABLE: "patterns", DRAFTS_TABLE: "drafts", REVIEWS_TABLE: "reviews",
  OBSERVATIONS_TABLE: "observations", PROFILES_TABLE: "profiles",
  USAGE_TABLE: "usage", FEEDBACK_TABLE: "feedback", SAFETY_EVENTS_TABLE: "safetyEvents",
};
for (const [k, v] of Object.entries(TABLES)) process.env[k] = v;

const test = require("node:test");
const assert = require("node:assert/strict");

// 2) In-memory store + ddb stubs BEFORE requiring access/api (they destructure
//    ddb fns at module load, so the stubs must be in place first).
const ddb = require("../lib/ddb");
const store = {};
function seed(table, items) { store[table] = (store[table] || []).concat(items); }
function rows(table) { return store[table] || []; }
function reset() { for (const k of Object.keys(store)) delete store[k]; }
function find(table, key) {
  return rows(table).find((r) => Object.entries(key).every(([k, v]) => r[k] === v)) || null;
}

// Return a COPY (like real DynamoDB) so later in-place mutations to the stored
// row don't retroactively change a value a handler already read.
ddb.get = async (table, key) => { const r = find(table, key); return r ? { ...r } : null; };
ddb.put = async (table, item) => { (store[table] = store[table] || []).push(item); return item; };
ddb.del = async (table, key) => {
  store[table] = rows(table).filter((r) => !Object.entries(key).every(([k, v]) => r[k] === v));
};
ddb.query = async (table, params) => {
  const m = /([A-Za-z0-9_]+)\s*=\s*(:[A-Za-z0-9_]+)/.exec(params.KeyConditionExpression || "");
  let out = rows(table).slice();
  if (m) {
    const attr = m[1];
    const val = (params.ExpressionAttributeValues || {})[m[2]];
    out = out.filter((r) => r[attr] === val);
  }
  if (params.ScanIndexForward === false) out = out.reverse();
  if (params.Limit) out = out.slice(0, params.Limit);
  return out;
};
ddb.update = async (table, key, params) => {
  let row = find(table, key);
  if (!row) { row = { ...key }; (store[table] = store[table] || []).push(row); }
  const ue = params.UpdateExpression || "";
  const vals = params.ExpressionAttributeValues || {};
  if (/safetyState = :e/.test(ue)) row.safetyState = vals[":e"];
  if (vals[":now"] !== undefined) row.updatedAt = vals[":now"];
  return { ...row };
};
ddb.transactWrite = async (items) => {
  // Validate conditions first (all-or-nothing).
  for (const it of items) {
    if (!it.Update) continue;
    const { TableName, Key, ConditionExpression, ExpressionAttributeValues: vals } = it.Update;
    if (!ConditionExpression) continue;
    const row = find(TableName, Key);
    const exists = !!row;
    const endedBlocked = /safetyState <> :ended/.test(ConditionExpression) &&
      row && row.safetyState === vals[":ended"];
    const needsExists = /attribute_exists\(/.test(ConditionExpression) && !exists;
    if (endedBlocked || needsExists) {
      const e = new Error("conditional check failed");
      e.name = "TransactionCanceledException";
      e.CancellationReasons = [{ Code: "ConditionalCheckFailed" }];
      throw e;
    }
  }
  // Apply.
  for (const it of items) {
    if (it.Update) {
      const { TableName, Key, UpdateExpression: ue, ExpressionAttributeValues: vals } = it.Update;
      let row = find(TableName, Key);
      if (!row) { row = { ...Key }; (store[TableName] = store[TableName] || []).push(row); }
      if (vals[":now"] !== undefined) row.lastActivityAt = vals[":now"];
      if (/ADD msgCount :one/.test(ue)) row.msgCount = (Number(row.msgCount) || 0) + (vals[":one"] || 1);
    } else if (it.Put) {
      (store[it.Put.TableName] = store[it.Put.TableName] || []).push(it.Put.Item);
    }
  }
};

// 3) Stub auth + classifier + moderator BEFORE requiring api.
const auth = require("../lib/auth");
let CURRENT_USER = "A";
auth.getCallerFromEvent = async () => ({ user: { userId: CURRENT_USER } });
auth.requireAuth = () => {};

const safety = require("../ai/safety");
let VERDICT = { danger: false, charged: false, category: "none", rationale: "" };
let classifyCalls = 0;
safety.classifyMessage = async () => { classifyCalls++; return VERDICT; };

const mediator = require("../ai/mediator");
let beatCalls = 0;
let lastBeatContext = null;
mediator.generateBeat = async ({ context }) => {
  beatCalls++; lastBeatContext = context;
  return { text: "Both of you want this to land well." };
};

const { handler } = require("../handlers/api");

// --- helpers ----------------------------------------------------------------
function ev(method, path, body) {
  return {
    requestContext: { http: { method } },
    rawPath: path,
    body: body ? JSON.stringify(body) : undefined,
  };
}
const SEND = "/relationships/REL/threads/T1/send";
async function send(body) {
  const res = await handler(ev("POST", SEND, body));
  return { status: res.statusCode, body: JSON.parse(res.body) };
}
function seedRel({ msgCount = 0, safetyState = "calm" } = {}) {
  reset();
  CURRENT_USER = "A";
  VERDICT = { danger: false, charged: false, category: "none", rationale: "" };
  classifyCalls = 0; beatCalls = 0; lastBeatContext = null;
  seed("relationships", [{ relationshipId: "REL", userAId: "A", userBId: "B" }]);
  seed("relMembers", [
    { userId: "A", relationshipId: "REL" },
    { userId: "B", relationshipId: "REL" },
  ]);
  seed("threads", [{ relationshipId: "REL", threadId: "T1", safetyState, msgCount, purpose: "planning" }]);
  seed("drafts", [{ userId: "A", threadId: "T1", text: "draft" }]);
  seed("messages", []);
}

// --- tests ------------------------------------------------------------------

test("plain message commits, increments msgCount, clears the draft", async () => {
  seedRel();
  VERDICT = { danger: false, charged: false, category: "none", rationale: "" };
  const r = await send({ text: "running 5 min late" });
  assert.equal(r.body.status, "sent");
  assert.equal(rows("messages").length, 1);
  assert.equal(find("threads", { relationshipId: "REL", threadId: "T1" }).msgCount, 1);
  assert.equal(find("drafts", { userId: "A", threadId: "T1" }), null);
});

test("CRITICAL: a charged message pauses for review and is NOT committed", async () => {
  seedRel();
  VERDICT = { danger: false, charged: true, category: "none", rationale: "" };
  const r = await send({ text: "I'm really hurt you didn't ask me" });
  assert.equal(r.body.status, "review");
  assert.equal(r.body.charged, true);
  assert.equal(rows("messages").length, 0, "charged message must not be written before confirm");
});

test("charged message commits once the user confirms", async () => {
  seedRel();
  VERDICT = { danger: false, charged: true, category: "none", rationale: "" };
  const r = await send({ text: "I'm hurt, and I still want us to decide together", confirm: true });
  assert.equal(r.body.status, "sent");
  assert.equal(rows("messages").length, 1);
});

test("CRITICAL: danger hard-stops the thread, writes a safety event, no message", async () => {
  seedRel();
  VERDICT = { danger: true, charged: true, category: "violence", rationale: "threat" };
  const r = await send({ text: "[dangerous]" });
  assert.equal(r.body.status, "ended");
  assert.equal(find("threads", { relationshipId: "REL", threadId: "T1" }).safetyState, "ended");
  assert.equal(rows("safetyEvents").length, 1);
  assert.equal(rows("messages").length, 0);
});

test("CRITICAL: danger stays authoritative even when confirm:true (cannot be bypassed)", async () => {
  seedRel();
  VERDICT = { danger: true, charged: true, category: "abuse", rationale: "abuse" };
  const r = await send({ text: "[dangerous]", confirm: true });
  assert.equal(r.body.status, "ended", "confirm must not skip the safety check");
  assert.equal(rows("messages").length, 0);
});

test("an already-ended thread refuses to send without re-classifying", async () => {
  seedRel({ safetyState: "ended" });
  const r = await send({ text: "anything" });
  assert.equal(r.body.status, "ended");
  assert.equal(classifyCalls, 0, "ended thread short-circuits before the classifier");
  assert.equal(rows("messages").length, 0);
});

test("auto-moderator fires on the Nth message and writes a SHARED beat", async () => {
  process.env.MODERATOR_EVERY_N = "2";
  seedRel({ msgCount: 1 }); // this send makes it 2
  VERDICT = { danger: false, charged: false, category: "none", rationale: "" };
  const r = await send({ text: "ok sounds good" });
  assert.equal(r.body.status, "sent");
  assert.equal(beatCalls, 1, "beat should fire on the 2nd message");
  assert.equal(rows("mediatorSummaries").length, 1);
  assert.equal(rows("mediatorSummaries")[0].kind, "moderator");
  delete process.env.MODERATOR_EVERY_N;
});

test("CRITICAL: moderator only ever receives SHARED context (no private leak)", async () => {
  seedRel();
  // also seed private rows for both users — they must never reach the moderator
  seed("drafts", [{ userId: "B", threadId: "T1", text: "B secret draft" }]);
  seed("reviews", [{ userId: "A", reviewId: "r", reviewText: "A secret review" }]);
  const res = await handler(ev("POST", "/relationships/REL/threads/T1/moderator", {}));
  const body = JSON.parse(res.body);
  assert.equal(body.status, "ok");
  assert.ok(body.summary && body.summary.text, "returns a beat");
  assert.equal(rows("mediatorSummaries").length, 1);
  // the context handed to the generator is shared-only
  assert.ok(lastBeatContext && lastBeatContext.shared, "has shared context");
  assert.equal(lastBeatContext.self, undefined, "no self/private block");
  assert.equal(lastBeatContext.partner, undefined, "no partner/private block");
  assert.ok(!JSON.stringify(lastBeatContext).includes("secret"), "no private data leaked");
});
