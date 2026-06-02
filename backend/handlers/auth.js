"use strict";

// Derived from the gatsby scaffold (Development/gatsby); see NOTICE.md.
// Adapted for Sayable: multi-tenant Users (not a closed Members list) and
// OPEN signup (no admin-approval gate — anyone can sign up; partners pair into
// relationships separately via invite links handled in handlers/api.js).

const { Router } = require("../lib/router");
const { ok, badRequest, unauthorized, forbidden } = require("../lib/response");
const { get, put, query, T } = require("../lib/ddb");
const { sign } = require("../lib/jwt");
const { newId, isoNow, sixDigitOtp } = require("../lib/ids");
const { sendOtp } = require("../lib/ses");
const { getCallerFromEvent } = require("../lib/auth");

const OTP_TTL_MIN = parseInt(process.env.OTP_TTL_MINUTES || "10", 10);
const OWNER_EMAIL = (process.env.OWNER_EMAIL || "").toLowerCase();

const router = new Router();

async function findUserByEmail(emailLower) {
  const matches = await query(T.users, {
    IndexName: "byEmail",
    KeyConditionExpression: "emailLower = :e",
    ExpressionAttributeValues: { ":e": emailLower },
    Limit: 1,
  });
  return matches[0] || null;
}

function firstNameFromEmail(email) {
  const local = (email.split("@")[0] || "").split(/[.+_-]/)[0] || "Friend";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

async function createUser({ email, emailLower, firstName, lastName, role }) {
  const user = {
    userId: newId("usr"),
    email,
    emailLower,
    firstName: firstName || firstNameFromEmail(emailLower),
    lastName: lastName || "",
    role: role || "user",
    status: "active", // open signup — active immediately
    createdAt: isoNow(),
    updatedAt: isoNow(),
  };
  await put(T.users, user);
  return user;
}

// The owner email is always an active admin (idempotent).
async function ensureOwnerAdmin() {
  if (!OWNER_EMAIL) return;
  const existing = await findUserByEmail(OWNER_EMAIL);
  if (existing) {
    if (existing.role !== "admin" || existing.status !== "active") {
      await put(T.users, {
        ...existing,
        role: "admin",
        status: "active",
        updatedAt: isoNow(),
      });
    }
    return;
  }
  await createUser({ email: OWNER_EMAIL, emailLower: OWNER_EMAIL, role: "admin" });
}

async function issueOtp(user) {
  const code = sixDigitOtp();
  const expiresAt = Math.floor((Date.now() + OTP_TTL_MIN * 60 * 1000) / 1000);
  await put(T.otp, {
    emailLower: user.emailLower,
    code,
    userId: user.userId,
    createdAt: isoNow(),
    expiresAt,
    attempts: 0,
  });
  await sendOtp(user.email, code);
}

// Returning users: send a code. Unknown email → signup-required.
router.post("/auth/request-otp", async ({ body }) => {
  const email = (body.email || "").toString().trim().toLowerCase();
  if (!email || !email.includes("@")) return badRequest("Email required");

  await ensureOwnerAdmin();

  const user = await findUserByEmail(email);
  if (!user) return ok({ status: "signup-required" });
  if (user.status !== "active") return forbidden("Account inactive");

  try {
    await issueOtp(user);
  } catch (e) {
    console.error("ses_send_failed", e);
    return badRequest("Could not send code. Try again shortly.");
  }
  return ok({ status: "code-sent" });
});

// Open signup: create the user (active) and send a code immediately.
router.post("/auth/signup", async ({ body }) => {
  const emailRaw = (body.email || "").toString().trim();
  const email = emailRaw.toLowerCase();
  if (!email || !email.includes("@")) return badRequest("Email required");
  const firstName = (body.firstName || "").toString().trim();
  const lastName = (body.lastName || "").toString().trim();

  await ensureOwnerAdmin();

  let user = await findUserByEmail(email);
  if (!user) {
    user = await createUser({ email: emailRaw, emailLower: email, firstName, lastName });
  } else if (firstName && !user.firstName) {
    user = { ...user, firstName, lastName: lastName || user.lastName, updatedAt: isoNow() };
    await put(T.users, user);
  }

  try {
    await issueOtp(user);
  } catch (e) {
    console.error("ses_send_failed", e);
    return badRequest("Could not send code. Try again shortly.");
  }
  return ok({ status: "code-sent" });
});

router.post("/auth/verify-otp", async ({ body }) => {
  const email = (body.email || "").toString().trim().toLowerCase();
  const code = (body.code || "").toString().trim();
  if (!email || !code) return badRequest("Email and code required");

  const rec = await get(T.otp, { emailLower: email });
  if (!rec) return unauthorized("Invalid code");
  const nowSec = Math.floor(Date.now() / 1000);
  if (rec.expiresAt && rec.expiresAt < nowSec) return unauthorized("Code expired");
  if ((rec.attempts || 0) >= 5) return forbidden("Too many attempts");
  if (rec.code !== code) {
    await put(T.otp, { ...rec, attempts: (rec.attempts || 0) + 1 });
    return unauthorized("Invalid code");
  }

  const user = await get(T.users, { userId: rec.userId });
  if (!user || user.status !== "active") {
    return unauthorized("Account not found or inactive");
  }

  const token = await sign({
    sub: user.userId,
    email: user.email,
    role: user.role || "user",
  });

  await put(T.users, { ...user, lastLoginAt: isoNow() });
  // Invalidate the OTP after use.
  await put(T.otp, {
    emailLower: email,
    code: "_used_",
    userId: rec.userId,
    createdAt: rec.createdAt,
    expiresAt: nowSec + 60,
    attempts: 99,
  });

  return ok({ token, user: sanitizeUser(user) });
});

router.post("/auth/logout", async () => ok({ ok: true }));

router.get("/auth/me", async ({ event }) => {
  const caller = await getCallerFromEvent(event);
  if (!caller) return unauthorized();
  return ok({ user: sanitizeUser(caller.user) });
});

function sanitizeUser(u) {
  return {
    userId: u.userId,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    role: u.role || "user",
    status: u.status || "active",
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt || null,
    lastInteractionAt: u.lastInteractionAt || null,
    theme: u.theme || null, // per-user light/dark preference (null = follow device)
  };
}

exports.handler = async (event) => router.handle(event);
exports.sanitizeUser = sanitizeUser;
exports.findUserByEmail = findUserByEmail;
exports.createUser = createUser;
