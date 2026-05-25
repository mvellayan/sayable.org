"use strict";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json", ...corsHeaders },
    body: JSON.stringify(body ?? {}),
  };
}

function ok(body) {
  return json(200, body);
}
function created(body) {
  return json(201, body);
}
function badRequest(message, extra) {
  return json(400, { error: message, ...(extra || {}) });
}
function unauthorized(message = "Unauthorized") {
  return json(401, { error: message });
}
function forbidden(message = "Forbidden") {
  return json(403, { error: message });
}
function notFound(message = "Not found") {
  return json(404, { error: message });
}
function serverError(err) {
  console.error("server_error", err);
  return json(500, { error: "Internal server error" });
}

function parseBody(event) {
  if (!event || event.body == null) return {};
  if (typeof event.body !== "string") return event.body;
  try {
    return JSON.parse(event.body);
  } catch {
    return null;
  }
}

module.exports = {
  json,
  ok,
  created,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  serverError,
  parseBody,
  corsHeaders,
};
