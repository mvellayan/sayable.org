# Sayable — Claude Code working notes

AI-assisted communication app for emotionally important conversations. "Say the hard
thing so it can actually be heard." Two people text inside the app; three agents help
(a private coach per person + a shared neutral moderator). React PWA + Node 20 Lambda +
DynamoDB + Anthropic, deployed to `sayable.org`. Forked from the gatsby scaffold (see NOTICE.md).

## Source-of-truth documents
- **`DESIGN.md`** — design system. Read before any visual or UI work. Memorable thing:
  "Finally, I feel heard."
- **`docs/`** — full product spec (20 sections, grouped by domain).
- **Design doc (current):** `muthu-main-design-20260527-141304.md` in the gstack project
  dir (`~/.gstack/projects/<gstack-slug>/` — run `gstack-slug` to resolve; it changed with
  the repo rename). The sayable.org re-lock: three-agent two-sided texting, the Approach C
  turn-gated send pipeline, scope decisions, and the review report. Supersedes the
  couples-first design.
- **Companions in the same dir:** `*-eng-review-architecture-*.md` (16-table DynamoDB
  schema, app-layer privacy boundary, AWS/CDK stack) and `*-eng-review-test-plan-*.md`.

## Design System
Always read `DESIGN.md` before making any visual or UI decisions. All font choices,
colors, spacing, and aesthetic direction are defined there. Do not deviate without
explicit user approval. In QA mode, flag any code that doesn't match `DESIGN.md`.

Specifically refuse to ship: messages in a sans/system font (messages use Newsreader
serif), alarm red anywhere, blue/purple gradients, loud rounded chat bubbles, the AI
layer styled as loudly as human messages, 3-column icon-circle grids, `system-ui` as a
primary font, or any carry-over of gatsby's 1920s aesthetic (Sayable forks the scaffold,
not the skin).

## Architecture (locked, see eng-review doc)
- DynamoDB has no RLS — the private/shared boundary (drafts/coaching never leak to the
  partner) is enforced 100% in `backend/lib/access.js`. `buildCoachContext` /
  `buildMediatorContext` are the only LLM-context assemblers; nothing else reads private
  tables. Heaviest tests live here.
- Realtime: short-poll. Onboarding: open signup + partner invite link. Domain: apex
  sayable.org.

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
