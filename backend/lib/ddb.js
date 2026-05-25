"use strict";

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  BatchWriteCommand,
  TransactWriteCommand,
} = require("@aws-sdk/lib-dynamodb");

const raw = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(raw, {
  marshallOptions: { removeUndefinedValues: true, convertEmptyValues: false },
});

// Table name map. Privacy class is documented here but ENFORCED in access.js —
// nothing outside access.js may read the PRIVATE tables directly.
const T = {
  // auth / identity
  users: process.env.USERS_TABLE,
  otp: process.env.OTP_TABLE,
  config: process.env.CONFIG_TABLE,
  // core — SHARED (both partners may read)
  relationships: process.env.RELATIONSHIPS_TABLE,
  relationshipMembers: process.env.RELATIONSHIP_MEMBERS_TABLE,
  relationshipInvites: process.env.RELATIONSHIP_INVITES_TABLE,
  threads: process.env.THREADS_TABLE,
  messages: process.env.MESSAGES_TABLE,
  mediatorSummaries: process.env.MEDIATOR_SUMMARIES_TABLE,
  patterns: process.env.PATTERNS_TABLE,
  // PRIVATE — owner-only (access.js is the only reader)
  drafts: process.env.DRAFTS_TABLE,
  reviews: process.env.REVIEWS_TABLE,
  observations: process.env.OBSERVATIONS_TABLE,
  profiles: process.env.PROFILES_TABLE,
  // ops
  usage: process.env.USAGE_TABLE,
  feedback: process.env.FEEDBACK_TABLE,
  safetyEvents: process.env.SAFETY_EVENTS_TABLE,
};

// Tables that hold owner-private data. access.js guards these; any direct read
// from a handler is a privacy-boundary violation (see CLAUDE.md / eng-review).
const PRIVATE_TABLES = Object.freeze([
  T.drafts,
  T.reviews,
  T.observations,
  T.profiles,
]);

async function get(table, key) {
  const r = await ddb.send(new GetCommand({ TableName: table, Key: key }));
  return r.Item || null;
}

async function put(table, item, opts = {}) {
  await ddb.send(new PutCommand({ TableName: table, Item: item, ...opts }));
  return item;
}

async function update(table, key, params) {
  const r = await ddb.send(
    new UpdateCommand({
      TableName: table,
      Key: key,
      ReturnValues: "ALL_NEW",
      ...params,
    })
  );
  return r.Attributes;
}

async function del(table, key) {
  await ddb.send(new DeleteCommand({ TableName: table, Key: key }));
}

async function query(table, params) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const r = await ddb.send(
      new QueryCommand({ TableName: table, ExclusiveStartKey, ...params })
    );
    items.push(...(r.Items || []));
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function scan(table, params = {}) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const r = await ddb.send(
      new ScanCommand({ TableName: table, ExclusiveStartKey, ...params })
    );
    items.push(...(r.Items || []));
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function batchWrite(table, items) {
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: { [table]: chunk },
      })
    );
  }
}

// Atomic multi-item write. Used by the send pipeline to write a Message only if
// the Thread is not in safetyState 'ended' (DDB has no cross-table transaction
// otherwise). Throws on ConditionalCheckFailed inside a TransactionCanceledException.
async function transactWrite(items) {
  await ddb.send(new TransactWriteCommand({ TransactItems: items }));
}

// True if a thrown error is a transaction cancellation due to a failed condition.
function isConditionalCancel(err) {
  if (!err) return false;
  if (err.name === "ConditionalCheckFailedException") return true;
  if (err.name === "TransactionCanceledException") {
    const reasons = err.CancellationReasons || [];
    return reasons.some((r) => r && r.Code === "ConditionalCheckFailed");
  }
  return false;
}

module.exports = {
  ddb,
  T,
  PRIVATE_TABLES,
  get,
  put,
  update,
  del,
  query,
  scan,
  batchWrite,
  transactWrite,
  isConditionalCancel,
};
