import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { openCoachStream } from "../coachStream";
import ThemeToggle from "./ThemeToggle";
import Pills from "./Pills";

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
  "Triggered safety concerns. Sayable.org cannot continue. " +
  "If anyone is in immediate danger, call emergency services such as 911. " +
  "Consider pausing this conversation and seeking real-world help.";

export default function ThreadView({ relationshipId, thread, contact, onBack }) {
  const { user, token } = useAuth();
  // Header: "{you} - {contact}: {thread title}"
  const titlePrefix = [user?.firstName, contact].filter(Boolean).join(" - ");
  const headerTitle = titlePrefix ? `${titlePrefix}: ${thread.name}` : thread.name;
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
  // Emotion pills: how the current draft is likely to land.
  const [reviewEmotions, setReviewEmotions] = useState([]);
  // Ready-to-send rewrites from the coach — one tap sends + clears the draft.
  const [rewrites, setRewrites] = useState([]);
  // Current observations (decision 2): always-on, about you + the dynamic.
  const [observation, setObservation] = useState(null);
  const [obsLoading, setObsLoading] = useState(false);
  // Receiver-side interpretation ("Their Coach"): { messageId: text }, private.
  const [interpretations, setInterpretations] = useState({});
  const interpRequested = useRef(new Set());
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

  // Receiver-side: when a charged message arrives from the partner, fetch my
  // private coach's read of it once per message and show it under that message.
  useEffect(() => {
    const inc = [...messages]
      .reverse()
      .find((m) => m.senderId !== user.userId && m.charged);
    if (!inc || interpRequested.current.has(inc.messageId)) return;
    interpRequested.current.add(inc.messageId);
    let cancelled = false;
    (async () => {
      try {
        const r = await api.interpret(relationshipId, thread.threadId);
        if (cancelled || !r.interpretation) return;
        setInterpretations((prev) => ({
          ...prev,
          [r.interpretation.messageId]: r.interpretation, // { emotions, text }
        }));
      } catch (_) {
        /* best-effort — interpretation is never load-bearing */
      }
    })();
    return () => { cancelled = true; };
  }, [messages, user.userId, relationshipId, thread.threadId]);

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
    setReviewEmotions([]);
    setRewrites([]);
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
        } else if (ev.type === "emotions") {
          setReviewEmotions(ev.emotions || []);
        } else if (ev.type === "rewrites") {
          setRewrites(ev.rewrites || []);
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
        setReviewEmotions([]);
        setRewrites([]);
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

  // One-tap send of a coach rewrite: send it as-is and clear the compose area.
  // confirm:true — the user explicitly chose a reviewed message (server still
  // re-checks the safety hard-stop on every commit).
  async function sendRewrite(text) {
    const t = (text || "").trim();
    if (!t || sending) return;
    setSending(true);
    setErr("");
    try {
      const r = await api.send(relationshipId, thread.threadId, t, { confirm: true });
      if (r.status === "sent") {
        setDraft("");
        setReview("");
        setActiveSkills([]);
        setReviewEmotions([]);
        setRewrites([]);
        await load();
        refreshObs();
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

  // Editing the draft invalidates any review (it was about the old text).
  function onDraftChange(e) {
    setDraft(e.target.value);
    if (review) {
      setReview("");
      setActiveSkills([]);
      setReviewEmotions([]);
      setRewrites([]);
      setShowNudge(false);
    }
  }

  // Delete this conversation on MY side. If the partner also deletes it, the
  // server purges it for good. Returns to the home list afterward.
  async function removeConversation() {
    if (
      !window.confirm(
        "Delete this conversation on your side? If your partner also deletes it, it's removed for good."
      )
    )
      return;
    try {
      await api.deleteThread(relationshipId, thread.threadId);
      onBack();
    } catch (e) {
      setErr(e.message);
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
        <span className="thread__name">{headerTitle}</span>
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
        <button
          className="topbar__link"
          onClick={removeConversation}
          title="Delete this conversation on your side"
        >
          delete
        </button>
        <ThemeToggle />
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
          const interp = !mine ? interpretations[m.messageId] : null;
          return (
            <React.Fragment key={m.messageId || m.ts}>
              <div className={`msg ${mine ? "msg--me" : ""}`}>
                <span className="msg__who">{mine ? "You" : "Your partner"}</span>
                <div className="msg__body">{m.text}</div>
              </div>
              {interp && (interp.emotions?.length || interp.text) && (
                <div className="coach-aside coach-aside--incoming">
                  <span className="coach-aside__label">
                    your coach · only you see this
                  </span>
                  <Pills emotions={interp.emotions} />
                  {interp.text && <div className="coach-aside__text">{interp.text}</div>}
                </div>
              )}
            </React.Fragment>
          );
        })}
        <div ref={endRef} />
      </div>

      {ended && (
        <div className="safety">
          <Pills safety />
          <div>
            <strong>Thread ended.</strong> {safetyMsg || DEFAULT_SAFETY}
          </div>
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
              <Pills emotions={reviewEmotions} />
              {availableSkills.length > 0 && (
                <div className="coach-aside__skills">
                  {activeSkills.length > 0 && (
                    <span className="coach-aside__leaning">
                      leaning on: {activeSkills.map((s) => s.label).join(" · ")}
                    </span>
                  )}
                  <button
                    type="button"
                    className="coach-aside__nudge"
                    onClick={() => setShowNudge((v) => !v)}
                    disabled={reviewing}
                  >
                    {activeSkills.length > 0 ? "nudge ▾" : "nudge a skill ▾"}
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
              {rewrites.length > 0 && (
                <div className="rewrites">
                  {rewrites.map((r, i) => (
                    <button
                      key={`${r.label}-${i}`}
                      type="button"
                      className="rewrite"
                      onClick={() => sendRewrite(r.text)}
                      disabled={sending}
                      title="Send this version"
                    >
                      <span className="rewrite__label">{r.label}</span>
                      <span className="rewrite__text">{r.text}</span>
                    </button>
                  ))}
                </div>
              )}
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
