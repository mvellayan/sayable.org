# Design System — BetterVibe

Memorable thing: **"Finally, I feel heard."**
The words are sacred. The human is centered. The interface's job is to get out of the
way and hold the conversation. Warmth through restraint, attention through typography.

Created by /design-consultation on 2026-05-25.

## Product Context
- **What this is:** An AI-assisted communication app for emotionally important
  conversations — a normal chat app with a quiet emotional-intelligence layer.
- **Who it's for:** Romantic couples first; relationships generally.
- **Space:** Relationship / communication / calm tooling.
- **Project type:** Mobile-first React PWA (forked from the gatsby scaffold).
- **Core principle:** Reduce emotional load, not process load. The AI surfaces only when
  it has a useful nudge.

## Aesthetic Direction
- **Direction:** Quiet & literary. A calm, well-typeset room — closer to a thoughtful
  reading app (iA Writer, Stoic) than a chat product.
- **Decoration level:** Minimal. Type and whitespace do the work.
- **Mood:** Calm, private, trustworthy, human. Never clinical (therapy app), never
  corporate SaaS, never alarmed (fight app), never a Gatsby 1920s pastiche.
- **Explicitly NOT:** gatsby's aesthetic. BetterVibe copies gatsby's *scaffold*, never its
  *skin* (no Fraunces/General Sans, no 1920s motifs, no green-light symbolism).

## Typography
The words are the product. Two real typefaces (never Inter / Roboto / system stacks).
- **Messages + emotional moments:** **Newsreader** — warm literary serif built for
  reading. Each message reads like a considered letter, not a throwaway text. (This is a
  deliberate risk: almost no chat app sets messages in a serif. It is the single most
  on-brand choice for "feel heard.")
- **UI / labels / nav / buttons:** **Hanken Grotesk** — warm humanist sans, highly legible.
- **Numbers / timestamps:** Hanken Grotesk with `font-variant-numeric: tabular-nums`.
- **AI (My Coach / Their Coach / Mediator):** Hanken Grotesk, smaller, muted ink —
  typographically recessive, never a chat bubble. The "quiet layer" must look quiet.
- **Loading:** Google Fonts (`Newsreader`, `Hanken Grotesk`), `font-display: swap`,
  preconnect to the font origin, preload the two critical weights.
- **Scale (1.25 major third):** 13 / 16 (body) / 20 / 25 / 31 / 39px. Body ≥16px always.
- **Line-height:** 1.6 for message body (serif needs air), 1.2 for headings.

## Color
Warm paper, zero blue, zero red. Communication/AI apps default to clinical blue or alarm
red; BetterVibe refuses both. Warm = held and human; the absence of red matters because
this app handles conflict and must never scream alarm.

| Token | Light | Role |
|-------|-------|------|
| `--bg` | `#F6F2EA` | warm paper background (not stark white) |
| `--ink` | `#1F1B16` | primary text — effortless reading is non-negotiable |
| `--ink-muted` | `#6B6358` | AI / secondary / timestamps |
| `--surface` | `#FBF8F2` | raised surfaces (compose bar, sheets) |
| `--hairline` | `#E7E0D3` | borders, dividers, message containers |
| `--accent` | `#B5654A` | grounded clay — the ONE action that matters, used sparingly |
| `--accent-ink` | `#FBF8F2` | text on accent |

- **Semantic:** success `#5A7A5A` (muted sage), warning `#B5894A` (ochre). **No red** —
  even errors use ink + ochre, never alarm red. Safety-state messaging (§14) uses ink on
  surface with weight, not color, to stay calm under the worst circumstances.
- **Dark mode (warm dim room, not pure black):** `--bg #17140F`, `--ink #E8E2D6`,
  `--ink-muted #A39A8B`, `--surface #1F1B15`, `--hairline #2C2720`, `--accent #C2755B`
  (desaturated ~15%). `color-scheme: dark` set.
- **Contrast:** all text meets WCAG AA (body ≥4.5:1). Color is never the only signal.

## Spacing
- **Base unit:** 8px.
- **Density:** spacious — generous air around messages signals "take your time."
- **Scale:** 4 / 8 / 16 / 24 / 32 / 48 / 64.
- **Max content width:** ~640px (single calm column).

## Layout
- **Approach:** calm single-column, mobile-first PWA. The message thread is the hero;
  everything else recedes. Compose bar pinned at bottom; hairline-quiet top nav.
- **Message containers:** hairline-quiet (a soft rule or a faint surface shift), NOT loud
  rounded bubbles. Sender's name/role sits above the text, quiet.
- **The AI layer:** quiet inline asides / margin notes — never a modal, never a badge
  buzz, never a chat bubble competing with the human voices.
- **Border radius:** restrained scale — 6px (inputs/buttons), 10px (sheets). No uniform
  bubbly radius on everything.
- **Safe areas:** `env(safe-area-inset-*)` for notch devices (PWA).

## Motion
- **Approach:** gentle, slow, minimal. Calm over flashy.
- **Easing:** ease-out entering, ease-in exiting, ease-in-out moving.
- **Duration:** 250–400ms (the calm end). The AI surfaces with a quiet fade-in.
- **Rules:** animate only `transform` / `opacity`; never `transition: all`; fully respect
  `prefers-reduced-motion`. No spring/bounce.

## AI-slop guardrails (refuse to ship)
Purple/blue gradients · 3-column icon-circle feature grids · centered-everything ·
uniform bubbly radius · decorative blobs/dividers · emoji as design elements ·
colored left-border cards · `system-ui` as the primary font · alarm red anywhere ·
loud chat bubbles · the AI styled as loudly as the humans.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-25 | Initial design system created | /design-consultation, anchored to "Finally, I feel heard" |
| 2026-05-25 | Messages set in Newsreader (serif) | Each message reads like a considered letter — the core differentiator |
| 2026-05-25 | Warm paper + clay; no blue, no red | Human/held, never clinical or alarmed; red would scream during conflict |
| 2026-05-25 | AI layer typographically recessive | The "quiet emotional-intelligence layer" must look quiet, never compete with human voices |
| 2026-05-25 | Reject gatsby's skin | BetterVibe forks gatsby's scaffold only; its own identity, no 1920s motifs |
