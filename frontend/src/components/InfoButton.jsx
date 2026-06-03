import React, { useState, useEffect, useRef } from "react";

// "i" icon → a quiet how-to modal. 44px tap target; focus moves into the modal on
// open, is trapped while open, and returns to the trigger on close (keyboard +
// screen-reader friendly). Esc / backdrop / × close.
export default function InfoButton() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const modalRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () =>
      modalRef.current
        ? modalRef.current.querySelectorAll(
            'button, [href], input, [tabindex]:not([tabindex="-1"])'
          )
        : [];

    // Move focus into the modal (the close button) on open.
    const f = focusables();
    (f[0] || modalRef.current)?.focus();

    function onKey(e) {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "Tab") {
        const els = focusables();
        if (!els.length) {
          e.preventDefault();
          return;
        }
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      triggerRef.current?.focus(); // return focus to the trigger
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="info-button"
        onClick={() => setOpen(true)}
        aria-label="How to use Sayable"
        aria-haspopup="dialog"
        title="How to use Sayable"
      >
        <span className="info-button__dot" aria-hidden="true">i</span>
      </button>

      {open && (
        <div className="info-backdrop" onClick={() => setOpen(false)}>
          <div
            className="info-modal"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label="How to use Sayable"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
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
