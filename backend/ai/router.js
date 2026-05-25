"use strict";

// "Who should answer?" routing call. Fast Haiku invocation that picks:
//   - primary: the one character this message most applies to
//   - commenters: any other characters (up to 6) who feel compelled to react
//
// Output is structured (tool use) so we get a predictable shape.

const { runTool, MODEL_FAST } = require("../lib/anthropic");
const { CHARACTER_IDS, routingDirectory } = require("./personas");

// Six is the hard ceiling: the other six members of the cast besides the primary.
// In practice the router should stay scarcity-biased and most turns will have
// 1-2 commenters; the high cap exists for the rare moments when most of the
// room would genuinely speak (a question about money, a direct accusation,
// the kind of moment that makes everyone in the room react).
const MAX_COMMENTERS = 6;

const ROUTING_TOOL = {
  name: "route_message",
  description: "Decide which characters speak in response to this message.",
  input_schema: {
    type: "object",
    properties: {
      primary: {
        type: "string",
        enum: CHARACTER_IDS,
        description:
          "The single character whose voice should answer the friend's message directly.",
      },
      commenters: {
        type: "array",
        items: { type: "string", enum: CHARACTER_IDS },
        maxItems: MAX_COMMENTERS,
        description:
          "Zero to six other characters who feel compelled to react — either to the friend or to the primary. Order matters: first commenter speaks first.",
      },
      reasoning: {
        type: "string",
        description:
          "One-sentence justification for the routing decision. For logs, not shown to the user.",
      },
    },
    required: ["primary", "commenters", "reasoning"],
  },
};

const ROUTING_SYSTEM = `You are the silent director of a chat room containing seven characters from The Great BetterVibe. A friend (a real user) has posted a message. Decide which characters should speak.

THE CAST:
${routingDirectory()}

ROUTING RULES:
- Pick exactly one primary responder. They should be the character this message most clearly belongs to — by topic, by relationship, by direct address ("@Daisy"), or by emotional fit.
- Pick commenters from those who would be *compelled* to speak. The cap is six (the rest of the cast), but most turns should have zero, one, or two commenters. Add a commenter only when that character would genuinely break their composure to react.
- The room should feel like a room, not a panel. If five people would naturally turn to look, five may speak. If only one person in the room cares about this topic, only the primary should speak.
- Never repeat the primary in the commenters list.
- A friend message about wealth attracts Tom (and often Daisy). About love attracts BetterVibe and Daisy. About observation attracts Nick. About boredom or modern women attracts Jordan. About desire and class-aspiration attracts Myrtle. About loss attracts George. About moral judgment usually attracts Nick. About the events of the novel's ending may attract many.
- If the message is direct ("@Tom") the primary MUST be that character.
- Direct accusations or charged questions ("did you mean to do it") may compel multiple voices — the accused, the witness, the antagonist.
- Order commenters by reaction speed and emotional intensity. Tom and Daisy speak fast. Nick speaks slowly. George rarely. Order them as they would actually pile into the room.
- Scarcity is still the default. Crowding is allowed when justified.

Return the route_message tool call.`;

async function routeMessage({ friendMessage, recentRoomContext = "", memberId }) {
  const userPrompt = `Friend says: "${friendMessage}"\n\nRecent room context:\n${recentRoomContext || "(empty room)"}\n\nDecide who answers.`;

  const { input } = await runTool({
    model: MODEL_FAST,
    system: ROUTING_SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
    tool: ROUTING_TOOL,
    maxTokens: 320,
    memberId,
  });

  // Defensive: cap at MAX_COMMENTERS, deduplicate, ensure primary not present.
  let { primary, commenters = [], reasoning = "" } = input;
  commenters = commenters
    .filter((id) => id !== primary)
    .filter((id, i, arr) => arr.indexOf(id) === i)
    .slice(0, MAX_COMMENTERS);

  return { primary, commenters, reasoning };
}

module.exports = { routeMessage, MAX_COMMENTERS };
