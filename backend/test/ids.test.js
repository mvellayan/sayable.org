"use strict";

// Unit tests for the small time/id helpers. Focused on isFresh — the freshness
// guard that bounds redundant regeneration of the coach's current observation
// (eng-review 2026-05-31). Pure function, no env, no network.
//
// Run: node --test   (from backend/)

const test = require("node:test");
const assert = require("node:assert/strict");

const { isFresh } = require("../lib/ids");

const NOW = Date.parse("2026-05-31T12:00:00Z");
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();

test("isFresh: within the TTL window is fresh", () => {
  assert.equal(isFresh(iso(0), 60, NOW), true); // just now
  assert.equal(isFresh(iso(30_000), 60, NOW), true); // 30s old, 60s ttl
  assert.equal(isFresh(iso(59_000), 60, NOW), true); // 59s old
});

test("isFresh: at or past the TTL boundary is stale", () => {
  assert.equal(isFresh(iso(60_000), 60, NOW), false); // exactly 60s old
  assert.equal(isFresh(iso(120_000), 60, NOW), false); // 2m old
});

test("isFresh: missing / invalid / zero-ttl ⇒ not fresh", () => {
  assert.equal(isFresh(null, 60, NOW), false);
  assert.equal(isFresh(undefined, 60, NOW), false);
  assert.equal(isFresh("", 60, NOW), false);
  assert.equal(isFresh("not-a-date", 60, NOW), false);
  assert.equal(isFresh(iso(10_000), 0, NOW), false); // ttl 0 disables freshness
  assert.equal(isFresh(iso(10_000), -5, NOW), false); // negative ttl
});

test("isFresh: a future timestamp is treated as not fresh (clock skew safety)", () => {
  assert.equal(isFresh(iso(-5_000), 60, NOW), false); // 5s in the future
});
