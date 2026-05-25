"use strict";

const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");

const sm = new SecretsManagerClient({});
const cache = new Map();

async function getSecret(arn) {
  if (!arn) throw new Error("Secret ARN not provided");
  if (cache.has(arn)) return cache.get(arn);
  const r = await sm.send(new GetSecretValueCommand({ SecretId: arn }));
  cache.set(arn, r.SecretString);
  return r.SecretString;
}

async function getJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  return getSecret(process.env.JWT_SECRET_ARN);
}

async function getAnthropicKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  return getSecret(process.env.ANTHROPIC_SECRET_ARN);
}

module.exports = { getSecret, getJwtSecret, getAnthropicKey };
