"use strict";

// Derived from the gatsby scaffold (Development/gatsby) streaming pattern; see
// NOTICE.md. Sayable coachFn: the PRIVATE draft-review stream (My Coach).
// Lambda function URL with RESPONSE_STREAM — streams ONLY to the requesting
// user. Context is assembled through lib/access.buildCoachContext so the
// partner's private data is never in scope.
//
// SSE protocol (one event per block):
//   event: review-start     {}
//   event: text-delta       { text }
//   event: review-complete  { reviewId }
//   event: error            { error }

const { getCallerFromEvent } = require("../lib/auth");
const { buildCoachContext, AccessError } = require("../lib/access");
const { reviewDraft } = require("../ai/coach");
const { get, put, T } = require("../lib/ddb");
const { newId, isoNow } = require("../lib/ids");

function sse(type, data) {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}
function write(stream, type, data) {
  stream.write(sse(type, data));
}

async function coachHandler(event, responseStream) {
  responseStream.setContentType("text/event-stream");
  try {
    const caller = await getCallerFromEvent(event);
    if (!caller) {
      write(responseStream, "error", { error: "Unauthorized" });
      return responseStream.end();
    }
    const userId = caller.user.userId;

    const body = JSON.parse(event.body || "{}");
    const relationshipId = (body.relationshipId || "").toString();
    const threadId = (body.threadId || "").toString();
    const draftText = (body.draftText || "").toString().trim();
    if (!relationshipId || !threadId || !draftText) {
      write(responseStream, "error", {
        error: "relationshipId, threadId and draftText are required",
      });
      return responseStream.end();
    }

    // PRIVACY BOUNDARY: this asserts membership and returns only the caller's
    // own private data + shared data + the partner's SHAREABLE profile fields.
    let context;
    try {
      context = await buildCoachContext(userId, relationshipId, threadId);
    } catch (e) {
      if (e instanceof AccessError) {
        write(responseStream, "error", { error: e.message });
        return responseStream.end();
      }
      throw e;
    }

    const thread = await get(T.threads, { relationshipId, threadId });
    if (thread && thread.safetyState === "ended") {
      write(responseStream, "error", { error: "This thread has ended." });
      return responseStream.end();
    }
    // Conversation purpose conditions the review. New threads store `purpose`;
    // fall back to legacy `goal` for threads created before the rename.
    const purpose = thread ? (thread.purpose || thread.goal || null) : null;
    // Optional manual Coach Skill override (a skill id); auto-selection biases by purpose.
    const skill = body.skill ? body.skill.toString() : null;

    write(responseStream, "review-start", {});
    let finalText = "";
    for await (const chunk of reviewDraft({ draftText, context, purpose, skill })) {
      if (chunk.type === "text_delta") {
        finalText += chunk.text;
        write(responseStream, "text-delta", { text: chunk.text });
      }
    }

    // Persist the review privately (Reviews: PK userId, SK reviewId).
    const reviewId = newId("rev");
    await put(T.reviews, {
      userId,
      reviewId,
      threadId,
      relationshipId,
      draftText,
      reviewText: finalText,
      createdAt: isoNow(),
    });

    write(responseStream, "review-complete", { reviewId });
    responseStream.end();
  } catch (e) {
    console.error("coach_handler_error", e);
    try {
      write(responseStream, "error", { error: e?.message || "Internal error" });
      responseStream.end();
    } catch (_) {
      /* stream already closed */
    }
  }
}

exports.handler =
  typeof awslambda !== "undefined" && awslambda.streamifyResponse
    ? awslambda.streamifyResponse(coachHandler)
    : coachHandler;
