"use strict";

const { get, put, T } = require("./ddb");

// USD per 1M tokens. APPROXIMATE — refresh from https://www.anthropic.com/pricing.
// Cache-read tokens are billed at ~10% of input rate per Anthropic's caching docs;
// we don't currently use caching, so the field exists for future use.
const RATES = {
  "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0, cacheRead: 0.1 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0, cacheRead: 0.3 },
  "claude-opus-4-7": { input: 15.0, output: 75.0, cacheRead: 1.5 },
};

function calcCostUsd(model, usage) {
  const r = RATES[model] || { input: 0, output: 0, cacheRead: 0 };
  const inT = usage?.input_tokens || 0;
  const outT = usage?.output_tokens || 0;
  const cacheT = usage?.cache_read_input_tokens || 0;
  return (inT * r.input + outT * r.output + cacheT * r.cacheRead) / 1_000_000;
}

function emptyUsage() {
  return {
    totals: {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      callCount: 0,
      costUsd: 0,
    },
    byModel: {},
    resetAt: null,
  };
}

function ensureModel(byModel, model) {
  if (!byModel[model]) {
    byModel[model] = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      callCount: 0,
      costUsd: 0,
    };
  }
  return byModel[model];
}

// Read-modify-write update on the member row. At our scale (5-10 users, AI calls
// happen in serial within a user session) the race window is negligible. If we
// outgrow this we can switch to a separate SayableUsage table or atomic ADDs on
// flat top-level numeric attributes.
async function recordUsage({ memberId, model, usage }) {
  if (!memberId || !usage) return;
  try {
    const member = await get(T.users, { userId: memberId });
    if (!member) return;

    const u = member.usage || emptyUsage();
    if (!u.totals) u.totals = emptyUsage().totals;
    if (!u.byModel) u.byModel = {};

    const inT = usage.input_tokens || 0;
    const outT = usage.output_tokens || 0;
    const cacheT = usage.cache_read_input_tokens || 0;
    const cost = calcCostUsd(model, usage);

    u.totals.inputTokens += inT;
    u.totals.outputTokens += outT;
    u.totals.cacheReadTokens += cacheT;
    u.totals.callCount += 1;
    u.totals.costUsd += cost;

    const m = ensureModel(u.byModel, model);
    m.inputTokens += inT;
    m.outputTokens += outT;
    m.cacheReadTokens += cacheT;
    m.callCount += 1;
    m.costUsd += cost;

    await put(T.users, { ...member, usage: u });
  } catch (e) {
    // Never block the API call on usage accounting.
    console.error("usage_record_failed", { memberId, model, error: e?.message });
  }
}

async function resetUsage(memberId) {
  const member = await get(T.users, { userId: memberId });
  if (!member) return null;
  const reset = emptyUsage();
  reset.resetAt = new Date().toISOString();
  const merged = { ...member, usage: reset };
  await put(T.users, merged);
  return merged;
}

module.exports = { RATES, calcCostUsd, emptyUsage, recordUsage, resetUsage };
