"use strict";

const jwt = require("jsonwebtoken");
const { getJwtSecret } = require("./secret");

const ttlDays = parseInt(process.env.JWT_TTL_DAYS || "30", 10);
const ISSUER = "bettervibe";

async function sign(payload) {
  const secret = await getJwtSecret();
  return jwt.sign(payload, secret, {
    expiresIn: `${ttlDays}d`,
    issuer: ISSUER,
  });
}

async function verify(token) {
  const secret = await getJwtSecret();
  return jwt.verify(token, secret, { issuer: ISSUER });
}

module.exports = { sign, verify };
