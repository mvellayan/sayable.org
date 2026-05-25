"use strict";

// Mood drift updater. After a turn completes, this runs as a fire-and-forget
// async call (Haiku) that reads the exchange and emits a delta per character's
// mood vector. The MoodState table is then updated.
//
// We also apply a 5% regression toward baseline on every turn, regardless of
// model output, so mood drift is bounded and reversible.

const { runTool, MODEL_FAST } = require("../lib/anthropic");
const { get, put, T } = require("../lib/ddb");
const { getCharacter } = require("./personas");

const REGRESSION_FACTOR = 0.05;

function buildMoodTool(characterId, dimensions) {
  const properties = {};
  for (const dim of dimensions) {
    properties[dim] = {
      type: "number",
      minimum: -0.3,
      maximum: 0.3,
      description: `Change to apply to ${characterId}'s ${dim} this turn, in [-0.3, +0.3]. Most turns are small drift.`,
    };
  }
  return {
    name: `mood_delta_${characterId}`,
    description: `Emit the mood-vector delta for ${characterId} after this conversational turn.`,
    input_schema: {
      type: "object",
      properties,
      required: dimensions,
    },
  };
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function regressTowardBaseline(current, baseline) {
  return current + (baseline - current) * REGRESSION_FACTOR;
}

async function updateMoodForCharacter({
  sessionId,
  characterId,
  exchangeText,
  memberId,
}) {
  const character = getCharacter(characterId);
  if (!character) return null;

  const existing = await get(T.moodState, { sessionId, characterId });
  const current = (existing && existing.moodVector) || {
    ...character.moodBaseline,
  };

  // Regress toward baseline first.
  const after = {};
  for (const dim of character.moodDimensions) {
    after[dim] = regressTowardBaseline(current[dim] ?? character.moodBaseline[dim], character.moodBaseline[dim]);
  }

  // Ask Haiku for an event-driven delta.
  const tool = buildMoodTool(characterId, character.moodDimensions);
  const system = `You are a quiet observer tracking the emotional state of a character from The Great BetterVibe across a chat session.\n\nCHARACTER: ${character.displayName}\nDOSSIER: ${character.dossier}\n\nDIMENSIONS YOU TRACK: ${character.moodDimensions.join(", ")}\n\nGiven the latest exchange in the room, emit a delta per dimension. Most exchanges produce small deltas (±0.05). Big moves (±0.2-0.3) only when something striking happens — direct rebuke, public affection, a betrayal mentioned, a memory triggered. Negative moves are allowed and common (e.g., despair lowers when a friend tells a joke).`;

  let delta = {};
  try {
    const { input } = await runTool({
      model: MODEL_FAST,
      system,
      messages: [{ role: "user", content: `Latest exchange:\n${exchangeText}\n\nEmit ${characterId}'s mood delta.` }],
      tool,
      maxTokens: 256,
      memberId,
    });
    delta = input || {};
  } catch (e) {
    console.error("mood_update_failed", { characterId, error: e?.message });
    // Soft-fail: regression-only update.
  }

  const next = {};
  for (const dim of character.moodDimensions) {
    next[dim] = clamp01(after[dim] + (typeof delta[dim] === "number" ? delta[dim] : 0));
  }

  await put(T.moodState, {
    sessionId,
    characterId,
    moodVector: next,
    updatedAt: new Date().toISOString(),
  });

  return next;
}

// Update mood for the primary + any commenters that participated. Fire-and-
// forget — we don't block the chat response on this.
async function updateMoodForTurn({
  sessionId,
  characterIds,
  exchangeText,
  memberId,
}) {
  const results = await Promise.allSettled(
    characterIds.map((id) =>
      updateMoodForCharacter({ sessionId, characterId: id, exchangeText, memberId })
    )
  );
  return results;
}

async function getMoodVector(sessionId, characterId) {
  const character = getCharacter(characterId);
  if (!character) return null;
  const existing = await get(T.moodState, { sessionId, characterId });
  if (existing && existing.moodVector) return existing.moodVector;
  return { ...character.moodBaseline };
}

module.exports = {
  updateMoodForCharacter,
  updateMoodForTurn,
  getMoodVector,
  REGRESSION_FACTOR,
};
