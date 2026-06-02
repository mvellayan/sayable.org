import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import ThemeToggle from "./ThemeToggle";

// Admin console — operational only (Sayable original; independent implementation,
// not copied from any other project). It reads accounts, usage, pairing metadata,
// and the safety-event log. It NEVER shows conversation content, drafts, coach
// reviews, or observations — the privacy boundary (backend access.js) is the whole
// product. Styled per DESIGN.md's app-UI rules: calm, dense, utility language.

const TABS = ["Overview", "Users", "Relationships", "Safety"];
const money = (n) => `$${(Number(n) || 0).toFixed(4)}`;
const when = (iso) => (iso ? new Date(iso).toLocaleString() : "—");

export default function Admin() {
  const { signout } = useAuth();
  const [tab, setTab] = useState("Overview");

  return (
    <div className="app">
      <div className="topbar">
        <Link className="topbar__link" to="/">←</Link>
        <h1 className="topbar__brand">Admin</h1>
        <div className="topbar__actions">
          <ThemeToggle />
          <button className="topbar__link" onClick={signout}>sign out</button>
        </div>
      </div>

      <nav className="admin-tabs">
        {TABS.map((t) => (
          <button
            key={t}
            className={`admin-tab ${tab === t ? "admin-tab--on" : ""}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>

      <div className="admin">
        {tab === "Overview" && <Overview />}
        {tab === "Users" && <Users />}
        {tab === "Relationships" && <Relationships />}
        {tab === "Safety" && <Safety />}
      </div>
    </div>
  );
}

// Small async-data hook: load on mount, expose data/err/loading + a reload fn.
function useLoader(fn, deps = []) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    setErr("");
    try {
      setData(await fn());
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, err, loading, reload: load };
}

function Overview() {
  const { data, err, loading } = useLoader(() => api.adminOverview());
  if (loading) return <div className="empty">…</div>;
  if (err) return <div className="auth__error">{err}</div>;
  const o = data;
  const stats = [
    ["Users", `${o.users.total}`, `${o.users.admins} admin · ${o.users.active} active`],
    ["Relationships", `${o.relationships.total}`, `${o.relationships.paired} paired`],
    ["Threads", `${o.threads.total}`, `${o.threads.ended} ended`],
    ["Safety events", `${o.safetyEvents.total}`, "hard-stops fired"],
    ["AI spend", money(o.costUsd), "all users, lifetime"],
  ];
  return (
    <div className="admin-stats">
      {stats.map(([label, value, sub]) => (
        <div key={label} className="admin-stat">
          <span className="admin-stat__label">{label}</span>
          <span className="admin-stat__value">{value}</span>
          <span className="admin-stat__sub">{sub}</span>
        </div>
      ))}
    </div>
  );
}

function Users() {
  const { user: me } = useAuth();
  const { data, err, loading, reload } = useLoader(() => api.adminUsers());
  const [busy, setBusy] = useState("");

  async function act(fn, id) {
    setBusy(id);
    try {
      await fn();
      await reload();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy("");
    }
  }

  if (loading) return <div className="empty">…</div>;
  if (err) return <div className="auth__error">{err}</div>;

  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th>Email</th><th>Name</th><th>Role</th><th>Status</th>
          <th>Joined</th><th>Last seen</th>
          <th className="num">Calls</th><th className="num">Cost</th><th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {data.users.map((u) => {
          const isMe = u.userId === me.userId;
          const b = busy === u.userId;
          return (
            <tr key={u.userId}>
              <td>{u.email}{isMe && <span className="admin-you"> you</span>}</td>
              <td>{[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}</td>
              <td>{u.role}</td>
              <td>{u.status}</td>
              <td className="admin-dim">{when(u.createdAt)}</td>
              <td className="admin-dim">{u.lastInteractionAt ? when(u.lastInteractionAt) : "—"}</td>
              <td className="num">{u.usage.callCount}</td>
              <td className="num">{money(u.usage.costUsd)}</td>
              <td className="admin-actions">
                {isMe ? (
                  <span className="admin-dim">—</span>
                ) : (
                  <>
                    <button className="admin-btn" disabled={b}
                      onClick={() => act(() => api.adminUpdateUser(u.userId, {
                        status: u.status === "active" ? "suspended" : "active",
                      }), u.userId)}>
                      {u.status === "active" ? "suspend" : "activate"}
                    </button>
                    <button className="admin-btn" disabled={b}
                      onClick={() => act(() => api.adminUpdateUser(u.userId, {
                        role: u.role === "admin" ? "user" : "admin",
                      }), u.userId)}>
                      {u.role === "admin" ? "demote" : "make admin"}
                    </button>
                    <button className="admin-btn" disabled={b}
                      onClick={() => act(() => api.adminResetUsage(u.userId), u.userId)}>
                      reset usage
                    </button>
                    <button className="admin-btn admin-btn--danger" disabled={b}
                      onClick={() => {
                        if (window.confirm(`Delete ${u.email}? Reversible — they can be re-added later, not banned.`))
                          act(() => api.adminDeleteUser(u.userId), u.userId);
                      }}>
                      delete
                    </button>
                  </>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Relationships() {
  const { data, err, loading } = useLoader(() => api.adminRelationships());
  if (loading) return <div className="empty">…</div>;
  if (err) return <div className="auth__error">{err}</div>;
  if (!data.relationships.length) return <div className="empty">No relationships yet.</div>;
  return (
    <table className="admin-table">
      <thead>
        <tr><th>Label</th><th>Context</th><th>Person A</th><th>Person B</th><th>Status</th><th>Created</th></tr>
      </thead>
      <tbody>
        {data.relationships.map((r) => (
          <tr key={r.relationshipId}>
            <td>{r.label || "—"}</td>
            <td>{r.context || "—"}</td>
            <td>{r.userA || "—"}</td>
            <td>{r.userB || <span className="admin-dim">waiting</span>}</td>
            <td>{r.status}</td>
            <td className="admin-dim">{when(r.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Safety() {
  const { data, err, loading } = useLoader(() => api.adminSafetyEvents());
  if (loading) return <div className="empty">…</div>;
  if (err) return <div className="auth__error">{err}</div>;
  if (!data.events.length) {
    return <div className="empty">No safety events. The hard-stop has not fired.</div>;
  }
  return (
    <table className="admin-table">
      <thead>
        <tr><th>When</th><th>Category</th><th>User</th><th>Rationale</th><th>Thread</th></tr>
      </thead>
      <tbody>
        {data.events.map((e, i) => (
          <tr key={`${e.ts}-${i}`}>
            <td className="admin-dim">{when(e.ts)}</td>
            <td>{e.category || "—"}</td>
            <td>{e.user || "—"}</td>
            <td>{e.rationale || "—"}</td>
            <td className="admin-dim">{e.threadId}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
