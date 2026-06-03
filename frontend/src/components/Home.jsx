import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { relativeTime } from "../time";
import ThreadView from "./ThreadView";
import ThemeToggle from "./ThemeToggle";
import InfoButton from "./InfoButton";

// Home — contacts-first.
//
//   logged in → Contacts (their real first name once connected)
//             → tap a contact → their Conversations (2-line: title + stats)
//             → tap a conversation → the chat (ThreadView)
//
// A contact is named after the partner's first name once they accept the invite
// (resolved server-side); until then it shows the temporary label you typed.
export default function Home() {
  const { user, signout } = useAuth();
  const [rels, setRels] = useState(null); // contacts
  const [rel, setRel] = useState(null); // selected contact
  const [threads, setThreads] = useState(null); // selected contact's conversations
  const [thread, setThread] = useState(null); // open conversation
  const [newRel, setNewRel] = useState("");
  const [newRelContext, setNewRelContext] = useState("");
  const [newThread, setNewThread] = useState("");
  const [newThreadPurpose, setNewThreadPurpose] = useState("");
  const [invite, setInvite] = useState(null);
  const [err, setErr] = useState("");

  // Contacts list — load + poll so a newly-accepted contact appears live.
  useEffect(() => {
    loadContacts();
    const id = setInterval(loadContacts, 5000);
    return () => clearInterval(id);
  }, []);

  // While viewing a contact's conversation list, poll for live stats.
  useEffect(() => {
    if (!rel || thread) return;
    loadThreads(rel.relationshipId);
    const id = setInterval(() => loadThreads(rel.relationshipId), 5000);
    return () => clearInterval(id);
  }, [rel, thread]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadContacts() {
    try {
      const r = await api.relationships();
      setRels(r.relationships || []);
    } catch (e) { setErr(e.message); }
  }

  async function loadThreads(rid) {
    try {
      const t = await api.threads(rid);
      const list = (t.threads || []).slice().sort((a, b) =>
        (b.lastActivityAt || b.createdAt || "").localeCompare(a.lastActivityAt || a.createdAt || "")
      );
      setThreads(list);
    } catch (_) { /* transient poll error */ }
  }

  function openContact(r) {
    setRel(r); setThread(null); setThreads(null); setInvite(null);
  }
  function backHome() {
    setRel(null); setThread(null); setThreads(null); setInvite(null);
    loadContacts();
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
      await loadContacts();
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

  // --- a contact's conversations ---------------------------------------------
  if (rel) {
    const name = rel.partnerName || rel.label;
    return (
      <div className="app">
        <div className="topbar">
          <button className="topbar__link" onClick={backHome}>←</button>
          <h1 className="topbar__brand">{name}</h1>
          <ThemeToggle />
        </div>
        <div className="home">
          {!rel.userBId && (
            <section className="invite-card">
              <span className="row__meta">
                Not connected yet. Send {name} this link — one tap to join.
              </span>
              {invite ? (
                <code className="invite-link">{invite}</code>
              ) : (
                <button className="btn btn--ghost" onClick={makeInvite}>Create invite link</button>
              )}
            </section>
          )}
          <section>
            <h2 className="section__title">Conversations</h2>
            {threads === null ? (
              <div className="empty">…</div>
            ) : threads.length === 0 ? (
              <div className="empty">No conversations yet. What do you want to talk about?</div>
            ) : (
              <div className="list">
                {threads.map((t) => (
                  <button key={t.threadId} className="convo" onClick={() => setThread(t)}>
                    <span className="convo__title">{t.name}</span>
                    <span className="convo__stats">
                      {(t.msgCount || 0)} message{t.msgCount === 1 ? "" : "s"}
                      {t.lastActivityAt ? ` · ${relativeTime(t.lastActivityAt)}` : ""}
                      {t.safetyState === "ended" ? " · ended" : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
          <form className="inline-form" onSubmit={createConversation}>
            <input
              className="field" placeholder="new conversation (e.g. Money)"
              value={newThread} onChange={(e) => setNewThread(e.target.value)}
            />
            <input
              className="field" list="purpose-options" placeholder="purpose (optional)"
              value={newThreadPurpose} onChange={(e) => setNewThreadPurpose(e.target.value)}
              title="what is this conversation about (type anything or pick one)"
            />
            <datalist id="purpose-options">
              <option value="planning" /><option value="argument" /><option value="repair" />
              <option value="feedback" /><option value="conflict" />
            </datalist>
            <button className="btn">Add</button>
          </form>
          {err && <div className="auth__error">{err}</div>}
        </div>
      </div>
    );
  }

  // --- home: contacts --------------------------------------------------------
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
        <section>
          <h2 className="section__title">Contacts</h2>
          {rels === null ? (
            <div className="empty">…</div>
          ) : rels.length === 0 ? (
            <div className="empty">No contacts yet. Add someone below, then send them the invite link.</div>
          ) : (
            <div className="list">
              {rels.map((r) => (
                <button key={r.relationshipId} className="row" onClick={() => openContact(r)}>
                  <span className="row__title">{r.partnerName || r.label}</span>
                  <span className="row__meta">{r.userBId ? "connected" : "invite pending"}</span>
                </button>
              ))}
            </div>
          )}
          <form className="inline-form" onSubmit={createContact}>
            <input
              className="field" placeholder="name this contact (e.g. Sam)"
              value={newRel} onChange={(e) => setNewRel(e.target.value)}
            />
            <input
              className="field" list="context-options" placeholder="context (optional)"
              value={newRelContext} onChange={(e) => setNewRelContext(e.target.value)}
              title="who you are to each other (type anything or pick one)"
            />
            <datalist id="context-options">
              <option value="married" /><option value="partnered" /><option value="friends" />
              <option value="family" /><option value="co-parenting" />
            </datalist>
            <button className="btn">Add</button>
          </form>
        </section>
        {err && <div className="auth__error">{err}</div>}
      </div>
    </div>
  );
}
