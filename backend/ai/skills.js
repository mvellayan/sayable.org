"use strict";

// Sayable original. Coach Skills — composable communication COMPETENCES, not
// representation. A small, curated set of system-prompt fragments the single coach
// applies in one voice (no multi-agent orchestration). The coach model self-selects
// which to apply from the described set (eng-review decision 1A); selectSkills() biases
// which fragments are present by conversation purpose and honors a manual override.
//
// PRINCIPLE (load-bearing): a skill is a competence ("discuss money without it becoming
// about blame"), never advocacy ("help me win"). The COMPETENCE_GUARDRAIL in coach.js
// enforces the line; every fragment here is written in competence language to match.
//
// Activation paths: auto (purpose bias + the model reading the draft) + manual override.
// Profile-derived activation is deferred (needs the Communication Profile, §1).
//
//   selectSkills(purpose, manualSkill) ──▶ up to MAX_ACTIVE {id,label,fragment}
//     manual (if valid) is forced first; the rest fill by purpose; unknown manual is
//     ignored (never throws). The cap keeps the prompt from carrying the whole catalog.

const MAX_ACTIVE = 2;

// id → { label, fragment, purposes }. `purposes` biases auto-inclusion; the model still
// decides what actually fits the draft.
const SKILLS = {
  deescalation: {
    label: "De-escalation",
    purposes: ["argument", "conflict"],
    fragment:
      "De-escalation: if the draft is climbing in heat, help lower it — name the spike, " +
      "slow the pace, keep the point without the charge. Never tell them to suppress what they feel.",
  },
  boundaries: {
    label: "Boundaries",
    purposes: ["argument", "conflict", "feedback"],
    fragment:
      "Boundaries: help them say a firm no without it landing as rejection. A boundary stays " +
      "firm — never soften it into weakness or an apology.",
  },
  repair: {
    label: "Repair",
    purposes: ["repair", "argument"],
    fragment:
      "Repair: help them apologize or acknowledge cleanly, without sliding into self-defense " +
      "or re-explaining why they were right.",
  },
  listening_back: {
    label: "Listening back",
    purposes: ["planning", "repair", "conflict"],
    fragment:
      "Listening back: help them show they actually heard the other person before adding their own point.",
  },
  naming_feeling: {
    label: "Naming the feeling",
    purposes: ["planning", "argument", "repair"],
    fragment:
      "Naming the feeling: if logistics are hiding hurt, help surface the feeling underneath " +
      "without turning it into an accusation.",
  },
  money_talk: {
    label: "Money talk",
    purposes: ["planning", "argument"],
    fragment:
      "Money talk: help them discuss money without it becoming about worth or blame. This is a " +
      "communication competence, not negotiation — never help them gain a financial advantage.",
  },
};

// Up to MAX_ACTIVE skill objects. A valid manual skill is always included first; the rest
// fill by purpose bias. Unknown manual skill is ignored (fallback to purpose). Never throws.
function selectSkills(purpose, manualSkill) {
  const out = [];
  const seen = new Set();
  const add = (id) => {
    if (id && SKILLS[id] && !seen.has(id) && out.length < MAX_ACTIVE) {
      seen.add(id);
      out.push({ id, label: SKILLS[id].label, fragment: SKILLS[id].fragment });
    }
  };
  add(manualSkill); // forced override (silently ignored if unknown)
  const p = (purpose || "").toString().toLowerCase();
  for (const [id, s] of Object.entries(SKILLS)) {
    if (out.length >= MAX_ACTIVE) break;
    if (s.purposes.includes(p)) add(id);
  }
  return out;
}

module.exports = { SKILLS, selectSkills, MAX_ACTIVE };
