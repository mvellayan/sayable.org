// REST client for the API Gateway endpoints. Streaming chat lives in chatStream.js
// because it uses the Lambda function URL directly, not API Gateway.

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
  requestOtp: (email) => request("/auth/request-otp", { method: "POST", body: { email } }),
  signup: (body) => request("/auth/signup", { method: "POST", body }),
  verifyOtp: (email, code) =>
    request("/auth/verify-otp", { method: "POST", body: { email, code } }),
  me: () => request("/auth/me"),

  characters: () => request("/characters"),
  messages: (opts = {}) => {
    const qs = new URLSearchParams(opts).toString();
    return request(`/messages${qs ? `?${qs}` : ""}`);
  },
  postMessage: (text) =>
    request("/messages", { method: "POST", body: { text } }),

  uploadAvatar: async (file) => {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const { uploadUrl, avatarUrl } = await request("/me/avatar-upload-url", {
      method: "POST",
      body: { ext },
    });
    await fetch(uploadUrl, {
      method: "PUT",
      headers: { "content-type": file.type },
      body: file,
    });
    return avatarUrl;
  },

  // admin
  adminMembers: () => request("/admin/members"),
  adminApprove: (id) =>
    request(`/admin/members/${id}/approve`, { method: "POST" }),
  adminDeny: (id) =>
    request(`/admin/members/${id}/deny`, { method: "POST" }),
  adminUsage: () => request("/admin/usage"),
};
