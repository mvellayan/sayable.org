"use strict";

const Anthropic = require("@anthropic-ai/sdk");
const { getAnthropicKey } = require("./secret");
const { recordUsage } = require("./usage");

// Model tiers. Pick the lowest tier that does the job.
// Haiku for routing + mood updates (classification work).
// Sonnet for character voice (the actual reply text).
// Opus reserved for the one-time dossier bootstrap script (admin/).
const MODEL_FAST = "claude-haiku-4-5-20251001";
const MODEL_DEFAULT = "claude-sonnet-4-6";
const MODEL_HARD = "claude-opus-4-7";

let cachedClient = null;
async function getClient() {
  if (cachedClient) return cachedClient;
  const apiKey = await getAnthropicKey();
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

// Tool-call wrapper for structured JSON outputs. Used by the router and mood
// updater where we want a typed result, not free-form prose.
async function runTool({
  model = MODEL_DEFAULT,
  system,
  messages,
  tool,
  maxTokens = 1024,
  memberId,
}) {
  const client = await getClient();

  const send = async () =>
    client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages,
    });

  let resp;
  try {
    resp = await send();
  } catch (e) {
    console.error("anthropic_request_failed", e?.message || e);
    throw e;
  }

  const block = (resp.content || []).find((b) => b.type === "tool_use");
  if (!block || block.name !== tool.name) {
    console.warn("anthropic_no_tool_use_first", { model, name: tool.name });
    resp = await send();
    const retryBlock = (resp.content || []).find((b) => b.type === "tool_use");
    if (!retryBlock || retryBlock.name !== tool.name) {
      throw new Error("Anthropic did not return the expected tool call");
    }
    if (memberId) recordUsage({ memberId, model, usage: resp.usage });
    return { input: retryBlock.input, usage: resp.usage };
  }
  if (memberId) recordUsage({ memberId, model, usage: resp.usage });
  return { input: block.input, usage: resp.usage };
}

// Plain text completion (no tool). Used for character voice — we want the
// model to write naturally, not fill a schema.
async function runText({
  model = MODEL_DEFAULT,
  system,
  messages,
  maxTokens = 400,
  memberId,
}) {
  const client = await getClient();
  const resp = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages,
  });
  const block = (resp.content || []).find((b) => b.type === "text");
  const text = block ? block.text : "";
  if (memberId) recordUsage({ memberId, model, usage: resp.usage });
  return { text, usage: resp.usage };
}

// Streaming text completion. Yields { type: "text_delta", text } chunks
// and a final { type: "done", usage } event.
async function* runTextStream({
  model = MODEL_DEFAULT,
  system,
  messages,
  maxTokens = 400,
  memberId,
}) {
  const client = await getClient();
  const stream = client.messages.stream({
    model,
    max_tokens: maxTokens,
    system,
    messages,
  });

  let finalUsage = null;
  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta?.type === "text_delta"
    ) {
      yield { type: "text_delta", text: event.delta.text };
    } else if (event.type === "message_delta" && event.usage) {
      finalUsage = event.usage;
    } else if (event.type === "message_stop") {
      // The SDK provides a final usage on the message-stop event in newer
      // versions; fall back to message_delta if not.
    }
  }

  const finalMessage = await stream.finalMessage();
  finalUsage = finalMessage.usage || finalUsage;
  if (memberId && finalUsage)
    recordUsage({ memberId, model, usage: finalUsage });
  yield { type: "done", usage: finalUsage };
}

module.exports = {
  runTool,
  runText,
  runTextStream,
  MODEL_FAST,
  MODEL_DEFAULT,
  MODEL_HARD,
};
