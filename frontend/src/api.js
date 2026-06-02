// REST client for the API Gateway endpoints. Private draft-review streaming
// lives in coachStream.js (Lambda function URL, not API Gateway).

const BASE = import.meta.env.VITE_API_BASE_URL || "";

let getTokenFn = () => null;
let onUnauthorized = () => {};

export function configureApi({ getToken, onAuthFailure }) {
  if (getToken) getTokenFn = getToken;
  if (onAuthFailure) onUnauthorized = onAuthFailure;
}

async function request(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body && !(opts.body instanceof FormData)) {
    headers["content-type"] = headers["content-type"] || "application/json";
  }
  const token = getTokenFn();
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers,
    body:
      opts.body && typeof opts.body === "object" && !(opts.body instanceof FormData)
        ? JSON.stringify(opts.body)
        : opts.body,
  });
  if (res.status === 401) {
    onUnauthorized();
    throw new Error("Unauthorized");
  }
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (!res.ok) {
    const msg = (data && data.error) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  // me / preferences
  saveTheme: (theme) => request("/me", { method: "PATCH", body: { theme } }),

  // auth
  requestOtp: (email) => request("/auth/request-otp", { method: "POST", body: { email } }),
  signup: (body) => request("/auth/signup", { method: "POST", body }),
  verifyOtp: (email, code) =>
    request("/auth/verify-otp", { method: "POST", body: { email, code } }),
  me: () => request("/auth/me"),

  // relationships
  relationships: () => request("/relationships"),
  createRelationship: (body) => request("/relationships", { method: "POST", body }),
  createInvite: (rid) => request(`/relationships/${rid}/invite`, { method: "POST" }),
  acceptInvite: (inviteId) =>
    request(`/invites/${inviteId}/accept`, { method: "POST" }),

  // threads
  threads: (rid) => request(`/relationships/${rid}/threads`),
  createThread: (rid, body) =>
    request(`/relationships/${rid}/threads`, { method: "POST", body }),
  // flat conversation list across all contacts (home screen)
  conversations: () => request("/conversations"),
  // delete a conversation on my side (purged when both sides delete)
  deleteThread: (rid, tid) =>
    request(`/relationships/${rid}/threads/${tid}`, { method: "DELETE" }),

  // messages + draft + send
  messages: (rid, tid) => request(`/relationships/${rid}/threads/${tid}/messages`),
  getDraft: (rid, tid) => request(`/relationships/${rid}/threads/${tid}/draft`),
  saveDraft: (rid, tid, text) =>
    request(`/relationships/${rid}/threads/${tid}/draft`, {
      method: "POST",
      body: { text },
    }),
  // Two-phase send. Phase 1 (default): if charged, returns {status:"review"} without
  // committing. Phase 2: pass confirm:true to commit (server re-classifies for danger).
  send: (rid, tid, text, { confirm = false } = {}) =>
    request(`/relationships/${rid}/threads/${tid}/send`, {
      method: "POST",
      body: { text, confirm },
    }),
  // Ask the shared moderator for one beat now (auto-cadence also fires server-side).
  requestModerator: (rid, tid) =>
    request(`/relationships/${rid}/threads/${tid}/moderator`, { method: "POST" }),

  // Receiver-side: my private coach's read of the latest charged message I received.
  interpret: (rid, tid) =>
    request(`/relationships/${rid}/threads/${tid}/interpret`, { method: "POST" }),

  // Current observations (private; about you + the dynamic). GET reads the stored
  // one instantly; POST regenerates it (called on thread-open and after send).
  getObservations: (rid, tid) =>
    request(`/relationships/${rid}/threads/${tid}/observations`),
  refreshObservations: (rid, tid) =>
    request(`/relationships/${rid}/threads/${tid}/observations`, { method: "POST" }),

  // admin (operational-only; requires role: admin)
  adminOverview: () => request("/admin/overview"),
  adminUsers: () => request("/admin/users"),
  adminUpdateUser: (userId, patch) =>
    request(`/admin/users/${userId}`, { method: "PATCH", body: patch }),
  adminResetUsage: (userId) =>
    request(`/admin/users/${userId}/reset-usage`, { method: "POST" }),
  adminDeleteUser: (userId) =>
    request(`/admin/users/${userId}`, { method: "DELETE" }),
  adminRelationships: () => request("/admin/relationships"),
  adminSafetyEvents: () => request("/admin/safety-events"),
};
