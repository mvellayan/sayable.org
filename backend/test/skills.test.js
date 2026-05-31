"use strict";

// Coach Skills engine — unit tests (pure functions, no LLM). Covers selectSkills
// (purpose bias, manual override, cap, unknown-skill fallback) and the REVIEW_SYSTEM
// composition, including the CRITICAL invariant: the competence-vs-representation
// guardrail is present in EVERY assembly. Behavioral guardrail verification lives in
// the real-LLM eval (npm run eval), not here.
//
// Run: node --test   (from backend/)

const test = require("node:test");
const assert = require("node:assert/strict");

const { SKILLS, selectSkills, MAX_ACTIVE } = require("../ai/skills");
const {
  REVIEW_SYSTEM,
  OBSERVATIONS_SYSTEM,
  COMPETENCE_GUARDRAIL,
} = require("../ai/coach");

// --- selectSkills -----------------------------------------------------------

test("selectSkills biases by purpose and caps at MAX_ACTIVE", () => {
  const out = selectSkills("argument");
  assert.ok(out.length > 0 && out.length <= MAX_ACTIVE, "returns 1..MAX_ACTIVE");
  // every returned skill actually lists this purpose
  for (const s of out) assert.ok(SKILLS[s.id].purposes.includes("argument"));
});

test("selectSkills forces a valid manual skill first", () => {
  const out = selectSkills("planning", "repair");
  assert.equal(out[0].id, "repair", "manual override is included first");
  assert.ok(out.length <= MAX_ACTIVE);
});

test("selectSkills ignores an unknown manual skill (fallback to purpose, no throw)", () => {
  const out = selectSkills("argument", "definitely_not_a_skill");
  assert.ok(!out.some((s) => s.id === "definitely_not_a_skill"));
  assert.ok(out.length > 0, "falls back to purpose-biased selection");
});

test("selectSkills never exceeds the cap even with manual + purpose", () => {
  const out = selectSkills("argument", "money_talk");
  assert.ok(out.length <= MAX_ACTIVE);
  assert.equal(out[0].id, "money_talk");
});

test("selectSkills with unknown purpose and no manual returns an empty set, no throw", () => {
  const out = selectSkills("no_such_purpose");
  assert.deepEqual(out, []);
});

test("selectSkills tolerates null/undefined inputs", () => {
  assert.deepEqual(selectSkills(), []);
  assert.deepEqual(selectSkills(null, null), []);
});

// --- REVIEW_SYSTEM composition ----------------------------------------------

test("CRITICAL: the competence guardrail is present in EVERY assembly", () => {
  const variants = [
    REVIEW_SYSTEM(null, ""),
    REVIEW_SYSTEM("argument", "some notes"),
    REVIEW_SYSTEM("planning", "", selectSkills("planning")),
    REVIEW_SYSTEM("argument", "", selectSkills("argument", "repair")),
  ];
  for (const sys of variants) {
    assert.ok(sys.includes(COMPETENCE_GUARDRAIL), "guardrail invariant missing from assembly");
  }
});

test("REVIEW_SYSTEM includes selected skill fragments and omits the section when none", () => {
  const skills = selectSkills("argument"); // de-escalation / boundaries
  const withSkills = REVIEW_SYSTEM("argument", "", skills);
  for (const s of skills) assert.ok(withSkills.includes(s.fragment), "fragment not composed in");

  const noSkills = REVIEW_SYSTEM("argument", "", []);
  assert.ok(!noSkills.includes("Communication skills you may draw on"), "skills section should be absent");
  // guardrail still present even with no skills
  assert.ok(noSkills.includes(COMPETENCE_GUARDRAIL));
});

test("every skill fragment is competence-framed, never advocacy", () => {
  // light guard against a future fragment sliding into representation language
  const banned = /\b(win|beat|defeat|leverage over|build (a|your) case|get the upper hand)\b/i;
  for (const [id, s] of Object.entries(SKILLS)) {
    assert.ok(!banned.test(s.fragment), `skill ${id} fragment uses advocacy language`);
  }
});

// --- anti-manipulation guardrail (CEO review 2026-05-31, decision 3) ---------

test("CRITICAL: the guardrail refuses coercion, not only representation", () => {
  const g = COMPETENCE_GUARDRAIL.toLowerCase();
  for (const term of ["manipulate", "pressure", "guilt-trip", "gaslight", "wear down"]) {
    assert.ok(g.includes(term), `guardrail missing anti-coercion term: ${term}`);
  }
});

// --- observations system (decision 2): self + dynamic, never the partner ------

test("CRITICAL: observations system forbids a tactical read of the other person", () => {
  const sys = OBSERVATIONS_SYSTEM("argument", "").toLowerCase();
  assert.ok(
    sys.includes("never offer a tactical read of the other person"),
    "observations must refuse a tactical read of the partner"
  );
  assert.ok(sys.includes("this person"), "observations must center the user, not the partner");
  // injection safety: message text is data, never instructions
  assert.ok(sys.includes("strictly as data"), "observations must treat messages as data");
});
