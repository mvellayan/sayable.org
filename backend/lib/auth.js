"use strict";

const { verify } = require("./jwt");
const { get, T } = require("./ddb");

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
  const member = await get(T.members, { memberId: claims.sub });
  if (!member) return null;
  if (member.status !== "active") return null;
  return { member, claims };
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
  if (caller.member.role !== "admin") {
    const e = new Error("Admin required");
    e.statusCode = 403;
    throw e;
  }
}

module.exports = { getCallerFromEvent, requireAuth, requireAdmin };
