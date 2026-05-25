# BetterVibe — Claude Code working notes

AI-assisted communication app for emotionally important conversations. "Say the hard
thing so it can actually be heard." React PWA + Node 20 Lambda + DynamoDB + Anthropic,
deployed to `bettervibe.live`. Forked from the gatsby scaffold (see NOTICE.md once added).

## Source-of-truth documents
- **`DESIGN.md`** — design system. Read before any visual or UI work. Memorable thing:
  "Finally, I feel heard."
- **`docs/`** — full product spec (20 sections, grouped by domain).
- **`~/.gstack/projects/bettervibe/muthu-main-eng-review-architecture-20260525-111702.md`**
  — locked engineering architecture: 16-table DynamoDB schema, app-layer privacy boundary,
  send pipeline + safety, AWS/CDK stack, build order.
- **`~/.gstack/projects/bettervibe/muthu-nobranch-design-20260525-103508.md`** — product
  design doc (office-hours).

## Design System
Always read `DESIGN.md` before making any visual or UI decisions. All font choices,
colors, spacing, and aesthetic direction are defined there. Do not deviate without
explicit user approval. In QA mode, flag any code that doesn't match `DESIGN.md`.

Specifically refuse to ship: messages in a sans/system font (messages use Newsreader
serif), alarm red anywhere, blue/purple gradients, loud rounded chat bubbles, the AI
layer styled as loudly as human messages, 3-column icon-circle grids, `system-ui` as a
primary font, or any carry-over of gatsby's 1920s aesthetic (BetterVibe forks the scaffold,
not the skin).

## Architecture (locked, see eng-review doc)
- DynamoDB has no RLS — the private/shared boundary (drafts/coaching never leak to the
  partner) is enforced 100% in `backend/lib/access.js`. `buildCoachContext` /
  `buildMediatorContext` are the only LLM-context assemblers; nothing else reads private
  tables. Heaviest tests live here.
- Realtime: short-poll. Onboarding: open signup + partner invite link. Domain: apex
  bettervibe.live.

## Skill routing
When the user's request matches an available skill, invoke it via the Skill tool.
- Product ideas/brainstorming → /office-hours
- Strategy/scope → /plan-ceo-review
- Architecture → /plan-eng-review
- Design system / plan review → /design-consultation or /plan-design-review
- Visual polish (live site) → /design-review
- Bugs/errors → /investigate
- QA/testing → /qa or /qa-only
- Code review/diff → /review
- Ship/deploy/PR → /ship or /land-and-deploy
- Save / resume context → /context-save · /context-restore
