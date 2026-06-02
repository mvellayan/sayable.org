import React, { useState, useEffect } from "react";

// "i" icon → a quiet modal explaining how to use Sayable. Esc / backdrop / × close.
// Independent implementation (a common modal shape); content + styling are Sayable's.
export default function InfoButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="info-button"
        onClick={() => setOpen(true)}
        aria-label="How to use Sayable"
        title="How to use Sayable"
      >
        i
      </button>

      {open && (
        <div
          className="info-backdrop"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="How to use Sayable"
        >
          <div className="info-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="info-modal__close"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
            <div className="info-modal__body">
              <h2 className="info-modal__title">How Sayable works</h2>
              <p className="info-modal__lede">
                Say the hard thing so it can actually be heard.
              </p>

              <h3>Start a conversation</h3>
              <ul>
                <li>Add a <strong>contact</strong>, then send them the invite link.</li>
                <li>Once they accept, open a <strong>conversation</strong> and start texting.</li>
                <li>A contact can have several conversations — tag each with a purpose.</li>
              </ul>

              <h3>Your private coach</h3>
              <ul>
                <li>Tap <strong>Check this</strong> before sending — see how it might land.</li>
                <li>Pills name the feelings; tap a <strong>rewrite</strong> to send that version.</li>
                <li><strong>Nudge</strong> to steer the coach: de-escalate, boundary, repair…</li>
                <li>Only you see your coach — never your drafts or reviews.</li>
              </ul>

              <h3>Receiving</h3>
              <ul>
                <li>When a charged message arrives, your coach quietly reads it for you — privately.</li>
              </ul>

              <h3>The shared moderator</h3>
              <ul>
                <li>Tap <strong>Where are we?</strong> for one neutral beat you both see.</li>
              </ul>

              <h3>Safety</h3>
              <ul>
                <li>If a thread turns dangerous, Sayable stops and points to real-world help.</li>
              </ul>

              <p className="info-modal__foot">
                Light or dark: use the sun/moon. Delete a conversation any time.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
