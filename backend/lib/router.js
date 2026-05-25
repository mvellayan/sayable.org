"use strict";

const { ok, notFound, serverError, badRequest, parseBody } = require("./response");

function compile(pattern) {
  const parts = pattern.split("/").filter(Boolean);
  return {
    pattern,
    parts,
    test(pathParts) {
      if (parts.length !== pathParts.length) return null;
      const params = {};
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (p.startsWith(":")) {
          params[p.slice(1)] = decodeURIComponent(pathParts[i]);
        } else if (p !== pathParts[i]) {
          return null;
        }
      }
      return params;
    },
  };
}

class Router {
  constructor() {
    this.routes = [];
  }
  add(method, pattern, handler) {
    this.routes.push({ method, compiled: compile(pattern), handler });
  }
  get(p, h) { this.add("GET", p, h); }
  post(p, h) { this.add("POST", p, h); }
  patch(p, h) { this.add("PATCH", p, h); }
  put(p, h) { this.add("PUT", p, h); }
  del(p, h) { this.add("DELETE", p, h); }

  async handle(event, ctx = {}) {
    const method =
      (event.requestContext && event.requestContext.http && event.requestContext.http.method) ||
      event.httpMethod ||
      "GET";
    const rawPath = event.rawPath || event.path || "/";
    if (method === "OPTIONS") return ok({});
    const pathParts = rawPath.split("/").filter(Boolean);
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const params = r.compiled.test(pathParts);
      if (params) {
        const body = parseBody(event);
        if (body === null) return badRequest("Invalid JSON body");
        try {
          return await r.handler({
            event,
            params,
            body,
            ctx,
            method,
            path: rawPath,
          });
        } catch (e) {
          if (e && e.statusCode) {
            return {
              statusCode: e.statusCode,
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ error: e.message }),
            };
          }
          return serverError(e);
        }
      }
    }
    return notFound(`No route for ${method} ${rawPath}`);
  }
}

module.exports = { Router };
