"use strict";

const { Router } = require("../lib/router");
const {
  ok,
  badRequest,
  unauthorized,
  forbidden,
} = require("../lib/response");
const { get, put, query, scan, T } = require("../lib/ddb");
const { sign } = require("../lib/jwt");
const { newId, isoNow, sixDigitOtp } = require("../lib/ids");
const { sendOtp, sendNotification, escapeHtml, appLink } = require("../lib/ses");
const { getCallerFromEvent } = require("../lib/auth");

const OTP_TTL_MIN = parseInt(process.env.OTP_TTL_MINUTES || "10", 10);
const OWNER_EMAIL = (process.env.OWNER_EMAIL || "").toLowerCase();
const APP_BRAND = process.env.APP_BRAND || "BetterVibe";

const router = new Router();

async function findMemberByEmail(emailLower) {
  const matches = await query(T.members, {
    IndexName: "byEmail",
    KeyConditionExpression: "emailLower = :e",
    ExpressionAttributeValues: { ":e": emailLower },
    Limit: 1,
  });
  return matches[0] || null;
}

async function ensureOwnerAdmin() {
  if (!OWNER_EMAIL) return;
  const existing = await findMemberByEmail(OWNER_EMAIL);
  if (existing) {
    if (existing.role !== "admin" || existing.status !== "active") {
      await put(T.members, {
        ...existing,
        role: "admin",
        status: "active",
        updatedAt: isoNow(),
      });
    }
    return;
  }
  const local = OWNER_EMAIL.split("@")[0].split(".")[0] || "Owner";
  const firstName = local.charAt(0).toUpperCase() + local.slice(1);
  await put(T.members, {
    memberId: newId("mbr"),
    email: OWNER_EMAIL,
    emailLower: OWNER_EMAIL,
    firstName,
    lastName: "",
    avatarUrl: null,
    role: "admin",
    status: "active",
    createdAt: isoNow(),
    updatedAt: isoNow(),
  });
}

router.post("/auth/request-otp", async ({ body }) => {
  const emailRaw = (body.email || "").toString().trim();
  const email = emailRaw.toLowerCase();
  if (!email || !email.includes("@")) return badRequest("Email required");

  await ensureOwnerAdmin();

  const member = await findMemberByEmail(email);

  if (!member) return ok({ status: "signup-required" });
  if (member.status === "pending") return ok({ status: "signup-pending" });
  if (member.status === "denied") return ok({ status: "denied" });
  if (member.status !== "active") return ok({ status: "signup-pending" });

  const code = sixDigitOtp();
  const now = Date.now();
  const expiresAt = Math.floor((now + OTP_TTL_MIN * 60 * 1000) / 1000);
  await put(T.otp, {
    emailLower: email,
    code,
    memberId: member.memberId,
    createdAt: isoNow(),
    expiresAt,
    attempts: 0,
  });

  try {
    await sendOtp(member.email, code);
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
  if (rec.expiresAt && rec.expiresAt < nowSec) {
    return unauthorized("Code expired");
  }
  if ((rec.attempts || 0) >= 5) return forbidden("Too many attempts");
  if (rec.code !== code) {
    await put(T.otp, { ...rec, attempts: (rec.attempts || 0) + 1 });
    return unauthorized("Invalid code");
  }

  const member = await get(T.members, { memberId: rec.memberId });
  if (!member || member.status !== "active") {
    return unauthorized("Account not found or inactive");
  }

  const token = await sign({
    sub: member.memberId,
    email: member.email,
    role: member.role || "user",
  });

  await put(T.members, { ...member, lastLoginAt: isoNow() });

  // Invalidate the OTP after use.
  await put(T.otp, {
    emailLower: email,
    code: "_used_",
    memberId: rec.memberId,
    createdAt: rec.createdAt,
    expiresAt: nowSec + 60,
    attempts: 99,
  });

  return ok({ token, member: sanitizeMember(member) });
});

router.post("/auth/signup", async ({ body }) => {
  const emailRaw = (body.email || "").toString().trim();
  const email = emailRaw.toLowerCase();
  if (!email || !email.includes("@")) return badRequest("Email required");
  const firstName = (body.firstName || "").toString().trim();
  const lastName = (body.lastName || "").toString().trim();
  if (!firstName) return badRequest("First name required");

  const existing = await findMemberByEmail(email);
  if (existing) {
    if (existing.status === "active") {
      return ok({ status: "already-active" });
    }
    const updated = {
      ...existing,
      firstName: firstName || existing.firstName,
      lastName: lastName || existing.lastName,
      updatedAt: isoNow(),
    };
    await put(T.members, updated);
    await emailAdminsSignupRequest(updated);
    return ok({ status: "signup-pending" });
  }

  const member = {
    memberId: newId("mbr"),
    email: emailRaw,
    emailLower: email,
    firstName,
    lastName,
    avatarUrl: null,
    role: "user",
    status: "pending",
    createdAt: isoNow(),
    updatedAt: isoNow(),
  };
  await put(T.members, member);
  await emailAdminsSignupRequest(member);
  return ok({ status: "signup-pending" });
});

async function emailAdminsSignupRequest(member) {
  const all = await scan(T.members);
  const admins = all.filter(
    (m) => m.role === "admin" && m.status === "active" && m.email
  );
  if (admins.length === 0) {
    console.warn("[auth] no active admins to notify of signup request");
    return;
  }
  const subject = `${APP_BRAND}: signup request — ${member.firstName} ${member.lastName}`;
  const html = `
    <div style="font-family:Georgia,'Iowan Old Style',serif;background:#F4EDDD;color:#1A1614;padding:28px 24px;border-radius:2px;max-width:480px;margin:0 auto;border:1px solid #D9CFB8;">
      <div style="font-style:italic;letter-spacing:0.04em;color:#B08D3B;font-size:20px;margin:0 0 16px;">${APP_BRAND}</div>
      <p style="font-family:-apple-system,sans-serif;margin:0 0 14px;line-height:1.55;">A new friend would like to join.</p>
      <table style="font-family:-apple-system,sans-serif;border-collapse:collapse;margin:12px 0;">
        <tr><td style="padding:4px 16px 4px 0;color:#6E665A;">Name</td><td><b>${escapeHtml(member.firstName)} ${escapeHtml(member.lastName)}</b></td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#6E665A;">Email</td><td>${escapeHtml(member.email)}</td></tr>
      </table>
      <p style="font-family:-apple-system,sans-serif;font-size:13px;color:#6E665A;margin-top:18px;">
        <a href="${appLink("/admin/members")}" style="color:#B08D3B;">Review at ${appLink("/admin/members")}</a>
      </p>
    </div>`;
  const text = [
    `${APP_BRAND}: signup request`,
    ``,
    `Name:  ${member.firstName} ${member.lastName}`,
    `Email: ${member.email}`,
    ``,
    `Review: ${appLink("/admin/members")}`,
  ].join("\n");

  for (const a of admins) {
    try {
      await sendNotification(a.email, subject, html, text);
    } catch (e) {
      console.error("[auth] admin notify failed", a.email, e.message);
    }
  }
}

router.post("/auth/logout", async () => ok({ ok: true }));

router.get("/auth/me", async ({ event }) => {
  const caller = await getCallerFromEvent(event);
  if (!caller) return unauthorized();
  return ok({ member: sanitizeMember(caller.member) });
});

function sanitizeMember(m) {
  return {
    memberId: m.memberId,
    firstName: m.firstName,
    lastName: m.lastName,
    email: m.email,
    avatarUrl: m.avatarUrl || null,
    role: m.role || "user",
    status: m.status || "active",
    usage: m.usage || null,
    createdAt: m.createdAt,
    lastLoginAt: m.lastLoginAt || null,
  };
}

exports.handler = async (event) => router.handle(event);
exports.sanitizeMember = sanitizeMember;
