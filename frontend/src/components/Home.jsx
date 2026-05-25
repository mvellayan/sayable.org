import React, { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import ThreadView from "./ThreadView";

// Relationships → threads → thread view. State-driven (no nested routes).
export default function Home() {
  const { signout } = useAuth();
  const [rels, setRels] = useState(null);
  const [rel, setRel] = useState(null);
  const [threads, setThreads] = useState(null);
  const [thread, setThread] = useState(null);
  const [newRel, setNewRel] = useState("");
  const [newThread, setNewThread] = useState("");
  const [invite, setInvite] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => { loadRels(); }, []);

  async function loadRels() {
    try { const r = await api.relationships(); setRels(r.relationships); }
    catch (e) { setErr(e.message); }
  }
  async function openRel(r) {
    setRel(r); setThread(null); setInvite(null); setThreads(null);
    try { const t = await api.threads(r.relationshipId); setThreads(t.threads); }
    catch (e) { setErr(e.message); }
  }
  async function createRel(e) {
    e.preventDefault();
    if (!newRel.trim()) return;
    try {
      const r = await api.createRelationship({ label: newRel.trim() });
      setNewRel("");
      await loadRels();
      openRel(r.relationship);
    } catch (e) { setErr(e.message); }
  }
  async function createThread(e) {
    e.preventDefault();
    if (!newThread.trim() || !rel) return;
    try {
      const t = await api.createThread(rel.relationshipId, { name: newThread.trim() });
      setNewThread("");
      const list = await api.threads(rel.relationshipId);
      setThreads(list.threads);
      setThread(t.thread);
    } catch (e) { setErr(e.message); }
  }
  async function makeInvite() {
    try { const r = await api.createInvite(rel.relationshipId); setInvite(r.link); }
    catch (e) { setErr(e.message); }
  }

  if (rel && thread) {
    return (
      <ThreadView
        relationshipId={rel.relationshipId}
        thread={thread}
        onBack={() => setThread(null)}
      />
    );
  }

  return (
    <div className="app">
      <div className="topbar">
        <h1 className="topbar__brand">BetterVibe</h1>
        <button className="topbar__link" onClick={signout}>sign out</button>
      </div>
      <div className="home">
        {!rel && (
          <>
            <section>
              <h2 className="section__title">Your relationships</h2>
              {rels === null ? (
                <div className="empty">…</div>
              ) : rels.length === 0 ? (
                <div className="empty">No relationships yet. Start one below.</div>
              ) : (
                <div className="list">
                  {rels.map((r) => (
                    <button key={r.relationshipId} className="row" onClick={() => openRel(r)}>
                      <span className="row__title">{r.label}</span>
                      <span className="row__meta">
                        {r.userBId ? "2 people" : "waiting for partner"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
            <form className="inline-form" onSubmit={createRel}>
              <input
                className="field" placeholder="name a relationship (e.g. Us)"
                value={newRel} onChange={(e) => setNewRel(e.target.value)}
              />
              <button className="btn">Create</button>
            </form>
          </>
        )}

        {rel && (
          <>
            <button className="topbar__link" onClick={() => { setRel(null); setThreads(null); }}>
              ← relationships
            </button>
            {!rel.userBId && (
              <section>
                <div className="row" style={{ flexDirection: "column", alignItems: "flex-start", gap: "8px" }}>
                  <span className="row__meta">
                    Invite your partner — they join with one tap, no setup.
                  </span>
                  {invite ? (
                    <code style={{ fontSize: 13, wordBreak: "break-all" }}>{invite}</code>
                  ) : (
                    <button className="btn btn--ghost" onClick={makeInvite}>
                      Create invite link
                    </button>
                  )}
                </div>
              </section>
            )}
            <section>
              <h2 className="section__title">{rel.label} · threads</h2>
              {threads === null ? (
                <div className="empty">…</div>
              ) : threads.length === 0 ? (
                <div className="empty">No threads yet. What do you want to talk about?</div>
              ) : (
                <div className="list">
                  {threads.map((t) => (
                    <button key={t.threadId} className="row" onClick={() => setThread(t)}>
                      <span className="row__title">{t.name}</span>
                      <span className="row__meta">
                        {t.safetyState === "ended" ? "ended" : t.status || "calm"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
            <form className="inline-form" onSubmit={createThread}>
              <input
                className="field" placeholder="new thread (e.g. Money, Feeling unheard)"
                value={newThread} onChange={(e) => setNewThread(e.target.value)}
              />
              <button className="btn">Add</button>
            </form>
          </>
        )}

        {err && <div className="auth__error">{err}</div>}
      </div>
    </div>
  );
}
