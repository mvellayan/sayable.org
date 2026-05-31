import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { openCoachStream } from "../coachStream";

// ──────────────────────────────────────────────────────────────────────────────
// ThreadView — the two-sided conversation surface.
//
// Approach C send-gate (eng-review decisions 1B, 3B) drives this UI:
//
//   draft → Send ──┬─▶ server: plain   ──▶ committed (status: "sent")
//                  ├─▶ server: charged ──▶ status: "review" (NOT committed)
//                  │       │
//                  │       └─▶ client auto-streams the private coach review;
//                  │            user picks Revise (back to edit) or Send (confirm:true)
//                  └─▶ server: danger  ──▶ thread ended
//
// Manual "Review" is the explicit "check this" nudge — runs the coach without
// sending. If a review is already on screen, Send goes straight to confirm:true.
// Editing the draft after a review clears it (the review is about the old text).
//
// Moderator beats (shared, neutral) arrive via the same /messages poll and are
// interleaved into the timeline by ts.
// ──────────────────────────────────────────────────────────────────────────────

const DEFAULT_SAFETY =
  "This conversation appears to have escalated into a safety concern. Sayable " +
  "cannot continue coaching or sending messages in this thread. If anyone is in " +
  "immediate danger, call emergency services such as 911. Consider pausing this " +
  "conversation and seeking real-world help.";

export default function ThreadView({ relationshipId, thread, onBack }) {
  const { user, token } = useAuth();
  const [messages, setMessages] = useState([]);
  const [beats, setBeats] = useState([]);
  const [safety, setSafety] = useState(thread.safetyState || "calm");
  const [safetyMsg, setSafetyMsg] = useState("");
  const [draft, setDraft] = useState("");
  const [review, setReview] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const [askingModerator, setAskingModerator] = useState(false);
  const [err, setErr] = useState("");
  // Coach Skills (decision 1): which competence the coach is leaning on + the small
  // set the one-tap nudge can redirect to. No standing picker — surfaced only mid-review.
  const [activeSkills, setActiveSkills] = useState([]);
  const [availableSkills, setAvailableSkills] = useState([]);
  const [showNudge, setShowNudge] = useState(false);
  // Current observations (decision 2): always-on, about you + the dynamic.
  const [observation, setObservation] = useState(null);
  const [obsLoading, setObsLoading] = useState(false);
  const endRef = useRef(null);

  async function load() {
    try {
      const r = await api.messages(relationshipId, thread.threadId);
      setMessages(r.messages || []);
      setBeats(r.moderatorBeats || []);
      if (r.safetyState) setSafety(r.safetyState);
    } catch (_) {
      /* transient poll error — ignore */
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [relationshipId, thread.threadId]);

  // Interleave human messages + shared moderator beats by timestamp.
  const timeline = useMemo(() => {
    const items = [
      ...messages.map((m) => ({ kind: "msg", ts: m.ts, data: m })),
      ...beats.map((b) => ({ kind: "beat", ts: b.ts, data: b })),
    ];
    items.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
    return items;
  }, [messages, beats]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [timeline.length]);

  // Current observations: load the stored one instantly, then regenerate.
  async function loadObs() {
    try {
      const r = await api.getObservations(relationshipId, thread.threadId);
      if (r.observation) setObservation(r.observation);
    } catch (_) {
      /* ignore — observations are best-effort presence, never load-bearing */
    }
  }
  async function refreshObs() {
    setObsLoading(true);
    try {
      const r = await api.refreshObservations(relationshipId, thread.threadId);
      if (r.observation) setObservation(r.observation);
    } catch (_) {
      /* fail-soft: keep whatever observation we already have */
    } finally {
      setObsLoading(false);
    }
  }

  // Refresh observations on thread-open (decision 4 cadence).
  useEffect(() => {
    setObservation(null);
    loadObs().then(refreshObs);
  }, [relationshipId, thread.threadId]);

  // Shared coach-review streamer. Updates the review text AND which competence the
  // coach is leaning on. `skill` (optional) is the one-tap nudge override.
  async function streamReview(text, skill) {
    setReview("");
    setActiveSkills([]);
    setShowNudge(false);
    setReviewing(true);
    setErr("");
    try {
      for await (const ev of openCoachStream({
        relationshipId,
        threadId: thread.threadId,
        draftText: text,
        token,
        skill,
      })) {
        if (ev.type === "skills") {
          setActiveSkills(ev.active || []);
          setAvailableSkills(ev.available || []);
        } else if (ev.type === "text-delta") setReview((p) => p + ev.text);
        else if (ev.type === "error") setErr(ev.error);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setReviewing(false);
    }
  }

  // Manual "Check this" — runs the coach review without sending.
  async function runReview() {
    if (!draft.trim()) return;
    try {
      await api.saveDraft(relationshipId, thread.threadId, draft);
    } catch (_) {
      /* non-fatal: review can still run on the in-memory draft */
    }
    await streamReview(draft, null);
  }

  // One-tap nudge: re-run the review biased toward a chosen competence.
  async function nudgeSkill(id) {
    if (!draft.trim()) return;
    await streamReview(draft, id);
  }

  // Server-driven send-gate. If a review is already on screen, the user has
  // already seen it: send with confirm:true. Otherwise, phase 1: if the server
  // returns status:"review" (charged), auto-stream the review and pause.
  async function send() {
    if (!draft.trim()) return;
    setSending(true);
    setErr("");
    try {
      const hasReview = review.trim().length > 0;
      const r = await api.send(relationshipId, thread.threadId, draft.trim(), {
        confirm: hasReview,
      });
      if (r.status === "sent") {
        setDraft("");
        setReview("");
        setActiveSkills([]);
        await load();
        refreshObs(); // decision 4: refresh observations after send
      } else if (r.status === "ended") {
        setSafety("ended");
        setSafetyMsg(r.safetyMessage || "");
      } else if (r.status === "review") {
        // Server says this draft is charged and we haven't reviewed it. Stream the
        // review now; the user picks Revise (edit) or Send (confirm:true).
        await streamReview(draft.trim(), null);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setSending(false);
    }
  }

  // Editing the draft invalidates any review (it was about the old text).
  function onDraftChange(e) {
    setDraft(e.target.value);
    if (review) {
      setReview("");
      setActiveSkills([]);
      setShowNudge(false);
    }
  }

  // "Where are we?" — on-request shared moderator beat. Beat lands via poll.
  async function askModerator() {
    setAskingModerator(true);
    setErr("");
    try {
      await api.requestModerator(relationshipId, thread.threadId);
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setAskingModerator(false);
    }
  }

  const ended = safety === "ended";
  const hasReview = review.trim().length > 0;

  return (
    <div className="thread">
      <div className="thread__head">
        <button className="topbar__link" onClick={onBack}>
          ←
        </button>
        <span className="thread__name">{thread.name}</span>
        {!ended && (
          <button
            className="topbar__link"
            onClick={askModerator}
            disabled={askingModerator}
            title="Ask the shared moderator where you two are"
          >
            {askingModerator ? "…" : "Where are we?"}
          </button>
        )}
      </div>

      <div className="messages">
        {timeline.length === 0 && (
          <div className="empty">No messages yet. Say the first thing.</div>
        )}
        {timeline.map((item) => {
          if (item.kind === "beat") {
            return (
              <div
                key={`mod-${item.data.summaryId || item.ts}`}
                className="mod-beat"
              >
                <span className="mod-beat__label">moderator · shared</span>
                <div className="mod-beat__body">{item.data.text}</div>
              </div>
            );
          }
          const m = item.data;
          const mine = m.senderId === user.userId;
          return (
            <div
              key={m.messageId || m.ts}
              className={`msg ${mine ? "msg--me" : ""}`}
            >
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

      {!ended && (observation || obsLoading) && (
        <div className="observations">
          <span className="observations__label">
            your coach notices · only you see this
          </span>
          <div className="observations__body">
            {observation ? observation.text : "Noticing…"}
          </div>
        </div>
      )}

      {!ended && (
        <div className="compose">
          {(review || reviewing) && (
            <div className="coach-aside">
              <span className="coach-aside__label">
                your coach · only you see this
              </span>
              {activeSkills.length > 0 && (
                <div className="coach-aside__skills">
                  <span className="coach-aside__leaning">
                    leaning on: {activeSkills.map((s) => s.label).join(" · ")}
                  </span>
                  <button
                    type="button"
                    className="coach-aside__nudge"
                    onClick={() => setShowNudge((v) => !v)}
                    disabled={reviewing}
                  >
                    nudge
                  </button>
                  {showNudge && (
                    <div className="coach-aside__nudge-row">
                      {availableSkills.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className="coach-aside__chip"
                          onClick={() => {
                            setShowNudge(false);
                            nudgeSkill(s.id);
                          }}
                          disabled={reviewing}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="coach-aside__text">
                {review || (reviewing ? "Reading…" : "")}
              </div>
            </div>
          )}
          <textarea
            placeholder="Write the hard thing…"
            value={draft}
            onChange={onDraftChange}
            disabled={sending || reviewing}
          />
          <div className="compose__actions">
            {hasReview ? (
              <>
                <button
                  className="btn btn--ghost"
                  onClick={() => setReview("")}
                  disabled={sending}
                >
                  Revise
                </button>
                <button
                  className="btn"
                  onClick={send}
                  disabled={sending || !draft.trim()}
                >
                  {sending ? "Sending…" : "Send"}
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn btn--ghost"
                  onClick={runReview}
                  disabled={reviewing || sending || !draft.trim()}
                >
                  {reviewing ? "Reading…" : "Check this"}
                </button>
                <button
                  className="btn"
                  onClick={send}
                  disabled={sending || reviewing || !draft.trim()}
                >
                  {sending ? "Sending…" : "Send"}
                </button>
              </>
            )}
          </div>
          {err && <div className="auth__error">{err}</div>}
        </div>
      )}
    </div>
  );
}
