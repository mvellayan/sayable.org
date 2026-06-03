import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { relativeTime } from "../time";
import ThreadView from "./ThreadView";
import ThemeToggle from "./ThemeToggle";
import InfoButton from "./InfoButton";

// Home — one screen.
//
//   Contacts (real first name once connected) — each shows a conversation count.
//   Tap a contact → it expands in place to list its conversations + start a new
//   one. Tap a conversation → the chat (ThreadView). No separate contact page.
export default function Home() {
  const { user, signout } = useAuth();
  const [rels, setRels] = useState(null); // contacts (with threadCount)
  const [expandedId, setExpandedId] = useState(null); // open accordion
  const [threadsByRel, setThreadsByRel] = useState({}); // rid → sorted threads
  const [open, setOpen] = useState(null); // { rel, thread } → ThreadView
  const [newRel, setNewRel] = useState("");
  const [newRelContext, setNewRelContext] = useState("");
  const [newThread, setNewThread] = useState("");
  const [newThreadPurpose, setNewThreadPurpose] = useState("");
  const [invite, setInvite] = useState(null);
  const [err, setErr] = useState("");

  // Contacts — load + poll so a newly-accepted contact / new count appears live.
  useEffect(() => {
    loadContacts();
    const id = setInterval(loadContacts, 5000);
    return () => clearInterval(id);
  }, []);

  // While a contact is expanded (and no chat open), poll its conversations.
  useEffect(() => {
    if (!expandedId || open) return;
    loadThreads(expandedId);
    const id = setInterval(() => loadThreads(expandedId), 5000);
    return () => clearInterval(id);
  }, [expandedId, open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadContacts() {
    try {
      const r = await api.relationships();
      const list = (r.relationships || []).slice().sort((a, b) =>
        (b.lastActivityAt || b.createdAt || "").localeCompare(a.lastActivityAt || a.createdAt || "")
      );
      setRels(list);
    } catch (e) { setErr(e.message); }
  }

  async function loadThreads(rid) {
    try {
      const t = await api.threads(rid);
      const list = (t.threads || []).slice().sort((a, b) =>
        (b.lastActivityAt || b.createdAt || "").localeCompare(a.lastActivityAt || a.createdAt || "")
      );
      setThreadsByRel((prev) => ({ ...prev, [rid]: list }));
    } catch (_) { /* transient poll error */ }
  }

  function toggleContact(r) {
    setInvite(null); setNewThread(""); setNewThreadPurpose("");
    setExpandedId((cur) => (cur === r.relationshipId ? null : r.relationshipId));
  }

  function openConversation(rel, thread) { setOpen({ rel, thread }); }
  function backHome() {
    setOpen(null);
    loadContacts();
    if (expandedId) loadThreads(expandedId);
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
      setExpandedId(r.relationship.relationshipId); // open it so they can invite/start
    } catch (e) { setErr(e.message); }
  }

  async function createConversation(e, rel) {
    e.preventDefault();
    if (!newThread.trim()) return;
    try {
      const t = await api.createThread(rel.relationshipId, {
        name: newThread.trim(),
        purpose: newThreadPurpose || undefined,
      });
      setNewThread(""); setNewThreadPurpose("");
      openConversation(rel, t.thread);
    } catch (e) { setErr(e.message); }
  }

  async function makeInvite(rel) {
    try { const r = await api.createInvite(rel.relationshipId); setInvite(r.link); }
    catch (e) { setErr(e.message); }
  }

  // --- open conversation -----------------------------------------------------
  if (open) {
    return (
      <ThreadView
        relationshipId={open.rel.relationshipId}
        thread={open.thread}
        contact={open.rel.partnerName || open.rel.label}
        onBack={backHome}
      />
    );
  }

  // --- home: contacts (accordion) --------------------------------------------
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
            <ul className="contacts">
              {rels.map((r) => {
                const name = r.partnerName || r.label;
                const expanded = expandedId === r.relationshipId;
                const threads = threadsByRel[r.relationshipId];
                return (
                  <li key={r.relationshipId} className="contact">
                    <button
                      className="contact__head"
                      onClick={() => toggleContact(r)}
                      aria-expanded={expanded}
                    >
                      <span className="contact__name">{name}</span>
                      {r.threadCount > 0 && (
                        <span className="contact__count" title={`${r.threadCount} conversation${r.threadCount === 1 ? "" : "s"}`}>
                          {r.threadCount}
                        </span>
                      )}
                      <span className="contact__meta">
                        {r.userBId ? "" : "invite pending"}
                      </span>
                      <span className={`contact__chev${expanded ? " is-open" : ""}`} aria-hidden="true">›</span>
                    </button>

                    {expanded && (
                      <div className="contact__body">
                        {!r.userBId && (
                          <div className="invite-card">
                            <span className="row__meta">
                              Not connected yet. Send {name} this link — one tap to join.
                            </span>
                            {invite ? (
                              <code className="invite-link">{invite}</code>
                            ) : (
                              <button className="btn btn--ghost" onClick={() => makeInvite(r)}>Create invite link</button>
                            )}
                          </div>
                        )}

                        {threads === undefined ? (
                          <div className="empty">…</div>
                        ) : threads.length === 0 ? (
                          <div className="empty">No conversations yet. Start one below.</div>
                        ) : (
                          <div className="list">
                            {threads.map((t) => (
                              <button key={t.threadId} className="convo" onClick={() => openConversation(r, t)}>
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

                        <form className="inline-form" onSubmit={(e) => createConversation(e, r)}>
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
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
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
