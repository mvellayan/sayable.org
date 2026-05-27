import React, { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { openCoachStream } from "../coachStream";

const DEFAULT_SAFETY =
  "This conversation appears to have escalated into a safety concern. Sayable " +
  "cannot continue coaching or sending messages in this thread. If anyone is in " +
  "immediate danger, call emergency services such as 911. Consider pausing this " +
  "conversation and seeking real-world help.";

export default function ThreadView({ relationshipId, thread, onBack }) {
  const { user, token } = useAuth();
  const [messages, setMessages] = useState([]);
  const [safety, setSafety] = useState(thread.safetyState || "calm");
  const [safetyMsg, setSafetyMsg] = useState("");
  const [draft, setDraft] = useState("");
  const [review, setReview] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const endRef = useRef(null);

  async function load() {
    try {
      const r = await api.messages(relationshipId, thread.threadId);
      setMessages(r.messages || []);
      if (r.safetyState) setSafety(r.safetyState);
    } catch (_) {
      /* transient poll error — ignore */
    }
  }

  // Short-poll every 3s for the partner's messages (realtime decision: poll).
  useEffect(() => {
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [relationshipId, thread.threadId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function runReview() {
    if (!draft.trim()) return;
    setReview(""); setReviewing(true); setErr("");
    try {
      await api.saveDraft(relationshipId, thread.threadId, draft);
      for await (const ev of openCoachStream({
        relationshipId,
        threadId: thread.threadId,
        draftText: draft,
        token,
      })) {
        if (ev.type === "text-delta") setReview((p) => p + ev.text);
        else if (ev.type === "error") setErr(ev.error);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setReviewing(false);
    }
  }

  async function send() {
    if (!draft.trim()) return;
    setSending(true); setErr("");
    try {
      const r = await api.send(relationshipId, thread.threadId, draft.trim());
      if (r.status === "sent") {
        setDraft(""); setReview("");
        await load();
      } else if (r.status === "ended") {
        setSafety("ended");
        setSafetyMsg(r.safetyMessage || "");
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setSending(false);
    }
  }

  const ended = safety === "ended";

  return (
    <div className="thread">
      <div className="thread__head">
        <button className="topbar__link" onClick={onBack}>←</button>
        <span className="thread__name">{thread.name}</span>
      </div>

      <div className="messages">
        {messages.length === 0 && (
          <div className="empty">No messages yet. Say the first thing.</div>
        )}
        {messages.map((m) => {
          const mine = m.senderId === user.userId;
          return (
            <div key={m.messageId || m.ts} className={`msg ${mine ? "msg--me" : ""}`}>
              <span className="msg__who">{mine ? "You" : "Your partner"}</span>
              <div className="msg__body">{m.text}</div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {ended && (
        <div className="safety">
          <strong>This thread has ended.</strong> {safetyMsg || DEFAULT_SAFETY}
        </div>
      )}

      {!ended && (
        <div className="compose">
          {review && (
            <div className="coach-aside">
              <span className="coach-aside__label">My Coach</span>
              {review}
            </div>
          )}
          <textarea
            placeholder="Write the hard thing…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={sending}
          />
          <div className="compose__actions">
            <button
              className="btn btn--ghost"
              onClick={runReview}
              disabled={reviewing || sending || !draft.trim()}
            >
              {reviewing ? "Reading…" : "Review"}
            </button>
            <button className="btn" onClick={send} disabled={sending || !draft.trim()}>
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
          {err && <div className="auth__error">{err}</div>}
        </div>
      )}
    </div>
  );
}
