"use strict";

const crypto = require("crypto");

function newId(prefix) {
  const buf = crypto.randomBytes(9).toString("base64url");
  return prefix ? `${prefix}_${buf}` : buf;
}

function isoNow() {
  return new Date().toISOString();
}

function todayInTz(tz = process.env.DEFAULT_TZ || "America/New_York") {
  return new Date().toLocaleDateString("en-CA", { timeZone: tz });
}

function hourInTz(tz = process.env.DEFAULT_TZ || "America/New_York", date = new Date()) {
  const s = date.toLocaleString("en-US", {
    timeZone: tz,
    hour12: false,
    hour: "2-digit",
  });
  return parseInt(s, 10);
}

// Yesterday's calendar date in the given timezone, formatted YYYY-MM-DD.
// Computed by shifting the day component on the today-in-tz string, so DST
// transitions don't drift the result.
function yesterdayInTz(tz = process.env.DEFAULT_TZ || "America/New_York") {
  const today = todayInTz(tz);
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Calendar date (YYYY-MM-DD) the given ISO timestamp falls on in the given tz.
function dateInTz(isoTs, tz = process.env.DEFAULT_TZ || "America/New_York") {
  if (!isoTs) return null;
  const d = new Date(isoTs);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-CA", { timeZone: tz });
}

function sixDigitOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

module.exports = { newId, isoNow, todayInTz, hourInTz, yesterdayInTz, dateInTz, sixDigitOtp };
