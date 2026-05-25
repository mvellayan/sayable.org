# Coupling

**Say the hard thing so it can actually be heard.**

Better words for the conversations that matter.

`bettervibe.live`

---

## What it is

Coupling is an AI-assisted communication app for emotionally important conversations.
It helps people say hard things in a way the other person can actually hear. It works
like a normal chat app with a quiet emotional intelligence layer.

The app is initially focused on romantic couples, but the data model supports
relationships more generally.

## The three AI roles

1. **My Coach** — private to User A.
2. **Their Coach** — private to User B.
3. **Shared Mediator** — visible to both users.

The AI surfaces only when it has a useful nudge.

## Key product principle

**Coupling should reduce emotional load, not add process load.**

It should feel like *a normal chat app with a quiet emotional intelligence layer* — not
a therapy app, not a worksheet. See [`docs/00-overview.md`](docs/00-overview.md) for the
full principle.

---

## Specification

The functional spec is split by domain under [`docs/`](docs/):

| File | Covers |
|------|--------|
| [`00-overview.md`](docs/00-overview.md) | Product definition, AI roles, key product principle |
| [`01-data-model.md`](docs/01-data-model.md) | Communication profile, relationships, chat threads |
| [`02-conversation-intelligence.md`](docs/02-conversation-intelligence.md) | Goal detection, drafting, AI review, status, misunderstanding detection |
| [`03-shared-mediator-and-memory.md`](docs/03-shared-mediator-and-memory.md) | Shared mediator, relationship pattern memory |
| [`04-repair-appreciation-offline.md`](docs/04-repair-appreciation-offline.md) | Repair mode, appreciation, offline action suggestions |
| [`05-safety.md`](docs/05-safety.md) | Safety-first guidance, no third-party participation |
| [`06-privacy-and-lifecycle.md`](docs/06-privacy-and-lifecycle.md) | Visibility/privacy, deletion and exit |
| [`07-operations.md`](docs/07-operations.md) | Cost control, admin, feedback |

## Build sequencing

This spec describes the full platform. The recommended build order — get the core
conversational loop into real use first, then layer the rest — is in the office-hours
design doc:

`~/.gstack/projects/bettervibe/muthu-nobranch-design-20260525-103508.md`

Short version:
1. **The living loop** — two users, one shared thread, `My Coach` draft review, the
   private/shared data boundary, basic `Shared Mediator`, safety hard-stop.
2. **Two-sided intelligence** — `Their Coach`, receiver interpretation, goal detection,
   status indicators, misunderstanding detection.
3. **Memory and warmth** — communication profiles, pattern memory, repair, appreciation.
4. **Operate it** — cost control, admin, feedback.
