import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import ThreadView from "./ThreadView";
import ThemeToggle from "./ThemeToggle";
import InfoButton from "./InfoButton";

// Home — WhatsApp-shaped, mobile-first single column.
//
//   ┌ Conversations (collapsible, open) ─ flat list across all contacts ─┐
//   │   tap a row → open that conversation (ThreadView)                  │
//   ├ Contacts (collapsible) ─ your accepted contacts ──────────────────┤
//   │   tap a contact → their conversations + start-new + invite        │
//   │   add a contact → name + context, then share an invite link       │
//   └────────────────────────────────────────────────────────────────────┘
//
// Connections are consent-gated: "Contacts" are accepted relationships, never a
// directory of all users. Context lives on the contact; purpose on each
// conversation (both condition the agents). Back from any thread returns here.
export default function Home() {
  const { user, signout } = useAuth();
  const [convs, setConvs] = useState(null); // flat conversation list
  const [rels, setRels] = useState(null); // contacts (relationships)
  const [rel, setRel] = useState(null); // selected contact (drill-down)
  const [threads, setThreads] = useState(null); // selected contact's threads
  const [thread, setThread] = useState(null); // open conversation
  const [newRel, setNewRel] = useState("");
  const [newRelContext, setNewRelContext] = useState("");
  const [newThread, setNewThread] = useState("");
  const [newThreadPurpose, setNewThreadPurpose] = useState("");
  const [invite, setInvite] = useState(null);
  const [err, setErr] = useState("");

  // Poll so a conversation a contact starts (or accepts into) appears for both
  // people without a manual reload.
  useEffect(() => {
    loadHome();
    const id = setInterval(loadHome, 5000);
    return () => clearInterval(id);
  }, []);

  async function loadHome() {
    try {
      const [c, r] = await Promise.all([api.conversations(), api.relationships()]);
      setConvs(c.conversations || []);
      setRels(r.relationships || []);
    } catch (e) { setErr(e.message); }
  }

  // Open a conversation straight from the flat list.
  function openConversation(c) {
    setRel({
      relationshipId: c.relationshipId,
      label: c.relationshipLabel,
      partnerName: c.partnerName,
    });
    setThread({
      threadId: c.threadId,
      name: c.name,
      purpose: c.purpose,
      status: c.status,
      safetyState: c.safetyState,
    });
  }

  // Drill into a contact to see their conversations / start a new one.
  async function openContact(r) {
    setRel(r); setThread(null); setInvite(null); setThreads(null);
    try { const t = await api.threads(r.relationshipId); setThreads(t.threads); }
    catch (e) { setErr(e.message); }
  }

  function backHome() {
    setRel(null); setThread(null); setThreads(null); setInvite(null);
    loadHome();
  }

  async function createContact(e) {
    e.preventDefault();
    if (!newRel.trim()) return;
    try {
      const r = await api.createRelationship({
        label: newRel.trim(),
        context: newRelContext || undefined,
      });
      setNewRel(""); setNewRelContext("");
      await loadHome();
      openContact(r.relationship);
    } catch (e) { setErr(e.message); }
  }

  async function createConversation(e) {
    e.preventDefault();
    if (!newThread.trim() || !rel) return;
    try {
      const t = await api.createThread(rel.relationshipId, {
        name: newThread.trim(),
        purpose: newThreadPurpose || undefined,
      });
      setNewThread(""); setNewThreadPurpose("");
      const list = await api.threads(rel.relationshipId);
      setThreads(list.threads);
      setThread(t.thread);
    } catch (e) { setErr(e.message); }
  }

  async function makeInvite() {
    try { const r = await api.createInvite(rel.relationshipId); setInvite(r.link); }
    catch (e) { setErr(e.message); }
  }

  // --- open conversation -----------------------------------------------------
  if (rel && thread) {
    return (
      <ThreadView
        relationshipId={rel.relationshipId}
        thread={thread}
        contact={rel.partnerName || rel.label}
        onBack={backHome}
      />
    );
  }

  // --- a contact's conversations (drill-down) --------------------------------
  if (rel) {
    return (
      <div className="app">
        <div className="topbar">
          <button className="topbar__link" onClick={backHome}>←</button>
          <h1 className="topbar__brand">{rel.partnerName || rel.label}</h1>
          <span />
        </div>
        <div className="home">
          {!rel.userBId && (
            <section className="invite-card">
              <span className="row__meta">
                Invite {rel.partnerName || rel.label} — they join with one tap, no setup.
              </span>
              {invite ? (
                <code className="invite-link">{invite}</code>
              ) : (
                <button className="btn btn--ghost" onClick={makeInvite}>
                  Create invite link
                </button>
              )}
            </section>
          )}
          <section>
            <h2 className="section__title">Conversations with {rel.partnerName || rel.label}</h2>
            {threads === null ? (
              <div className="empty">…</div>
            ) : threads.length === 0 ? (
              <div className="empty">No conversations yet. What do you want to talk about?</div>
            ) : (
              <div className="list">
                {threads.map((t) => (
                  <button key={t.threadId} className="row" onClick={() => setThread(t)}>
                    <span className="row__title">{t.name}</span>
                    <span className="row__meta">
                      {t.safetyState === "ended" ? "ended" : t.purpose || t.status || "calm"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
          <form className="inline-form" onSubmit={createConversation}>
            <input
              className="field" placeholder="new conversation (e.g. Money, Feeling unheard)"
              value={newThread} onChange={(e) => setNewThread(e.target.value)}
            />
            <input
              className="field" list="purpose-options"
              placeholder="purpose (optional)"
              value={newThreadPurpose}
              onChange={(e) => setNewThreadPurpose(e.target.value)}
              title="what is this conversation about (type anything or pick one)"
            />
            <datalist id="purpose-options">
              <option value="planning" />
              <option value="argument" />
              <option value="repair" />
              <option value="feedback" />
              <option value="conflict" />
            </datalist>
            <button className="btn">Add</button>
          </form>
          {err && <div className="auth__error">{err}</div>}
        </div>
      </div>
    );
  }

  // --- home: conversations + contacts ----------------------------------------
  return (
    <div className="app">
      <div className="topbar">
        <h1 className="topbar__brand">
          Sayable.org{user?.firstName ? ` - ${user.firstName}` : ""}
        </h1>
        <div className="topbar__actions">
          <InfoButton />
          <ThemeToggle />
          {user?.role === "admin" && (
            <Link className="topbar__link" to="/admin">admin</Link>
          )}
          <button className="topbar__link" onClick={signout}>sign out</button>
        </div>
      </div>

      <div className="home">
        <details className="panel" open>
          <summary className="panel__summary">Conversations</summary>
          <div className="panel__body">
            {convs === null ? (
              <div className="empty">…</div>
            ) : convs.length === 0 ? (
              <div className="empty">No conversations yet. Pick a contact below to start one.</div>
            ) : (
              <div className="list">
                {convs.map((c) => (
                  <button
                    key={c.threadId}
                    className="row"
                    onClick={() => openConversation(c)}
                  >
                    <span className="row__title">
                      {c.name}
                      <span className="row__contact"> · {c.partnerName || c.relationshipLabel}</span>
                    </span>
                    <span className="row__meta">
                      {c.safetyState === "ended" ? "ended" : c.purpose || c.status || "calm"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </details>

        <details className="panel">
          <summary className="panel__summary">Contacts</summary>
          <div className="panel__body">
            {rels === null ? (
              <div className="empty">…</div>
            ) : rels.length === 0 ? (
              <div className="empty">No contacts yet. Add one below and send them an invite.</div>
            ) : (
              <div className="list">
                {rels.map((r) => (
                  <button key={r.relationshipId} className="row" onClick={() => openContact(r)}>
                    <span className="row__title">{r.partnerName || r.label}</span>
                    <span className="row__meta">
                      {r.userBId ? "connected" : "invite pending"}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <form className="inline-form" onSubmit={createContact}>
              <input
                className="field" placeholder="add a contact (e.g. Mom, Alex)"
                value={newRel} onChange={(e) => setNewRel(e.target.value)}
              />
              <input
                className="field" list="context-options"
                placeholder="context (optional)"
                value={newRelContext}
                onChange={(e) => setNewRelContext(e.target.value)}
                title="who you are to each other (type anything or pick one)"
              />
              <datalist id="context-options">
                <option value="married" />
                <option value="partnered" />
                <option value="friends" />
                <option value="family" />
                <option value="co-parenting" />
              </datalist>
              <button className="btn">Add</button>
            </form>
          </div>
        </details>

        {err && <div className="auth__error">{err}</div>}
      </div>
    </div>
  );
}
