"use strict";

const { verify } = require("./jwt");
const { get, put, T } = require("./ddb");

// Throttle lastInteractionAt writes — one per minute per user is enough for
// "when was this user last active" and avoids a DDB write on every API call.
const LAST_INTERACTION_THROTTLE_MS = 60 * 1000;

async function touchLastInteraction(user) {
  const now = Date.now();
  const prev = user.lastInteractionAt ? Date.parse(user.lastInteractionAt) : 0;
  if (Number.isFinite(prev) && now - prev < LAST_INTERACTION_THROTTLE_MS) return;
  user.lastInteractionAt = new Date(now).toISOString();
  await put(T.users, { ...user });
}

async function getCallerFromEvent(event) {
  const headers = event.headers || {};
  const authz =
    headers.authorization || headers.Authorization || headers.AUTHORIZATION;
  if (!authz || !authz.toLowerCase().startsWith("bearer ")) return null;
  const token = authz.slice(7).trim();
  let claims;
  try {
    claims = await verify(token);
  } catch {
    return null;
  }
  if (!claims || !claims.sub) return null;
  const user = await get(T.users, { userId: claims.sub });
  if (!user) return null;
  if (user.status !== "active") return null;
  // Activity tracking — throttled, never blocks meaningfully.
  try { await touchLastInteraction(user); } catch (_) {}
  return { user, claims };
}

function requireAuth(caller) {
  if (!caller) {
    const e = new Error("Unauthorized");
    e.statusCode = 401;
    throw e;
  }
}

function requireAdmin(caller) {
  requireAuth(caller);
  if (caller.user.role !== "admin") {
    const e = new Error("Admin required");
    e.statusCode = 403;
    throw e;
  }
}

module.exports = { getCallerFromEvent, requireAuth, requireAdmin };
