# TODOS

Deferred work, with enough context to pick up cold. Add date + source when filing.

## Observability

### Make moderator coercion-surfacing measurable
- **What:** Tag and/or log when the shared moderator surfaces a coercive/pressuring
  dynamic (decision 3, `backend/ai/mediator.js`), so it can be distinguished from an
  ordinary "fuller" beat and counted.
- **Why:** The moderator now names coercion (the anti-manipulation protection users
  asked for), but it writes a normal `mediatorSummaries` beat with no marker. Today
  there is no way to tell whether the protection ever fires, or how often.
- **Current state:** `generateBeat` returns prose; `postModeratorBeat` writes a row with
  `kind: "moderator"`. Coercion surfacing is purely prompt-driven and unlabeled.
- **Where to start:** have `generateBeat` (or a light classifier on its output) flag a
  `surfacedCoercion: true` signal; persist it on the summary row and/or log a counter.
  Tune the detection against real conversations once they exist.
- **Effort:** S (human ~1h / CC ~15min). **Priority:** P2.
- **Depends on:** real-conversation data to tune against (don't tune blind).
- **Source:** /plan-eng-review 2026-05-31.

## Deferred from CEO review (2026-05-31)

### Receiver-side coercion flagging (§8)
- **What:** Each person's own coach flags incoming coercion to the target.
- **Why:** Strongest anti-manipulation protection; the compose-side refusal + moderator
  are necessary but not sufficient.
- **Depends on:** receiver-side coaching scope + real-conversation data. **Priority:** P2.

### Profile-derived skill activation
- **What:** Activate Coach Skills from the Communication Profile (§1) instead of only
  purpose-bias + manual nudge.
- **Depends on:** the Communication Profile shipping. **Priority:** P3.
