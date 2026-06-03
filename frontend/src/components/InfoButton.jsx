import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import instructionsMd from "../instructions.md?raw";
import { renderMarkdown } from "../markdown";

// "i" icon → a quiet how-to modal. 44px tap target; focus moves into the modal on
// open, is trapped while open, and returns to the trigger on close (keyboard +
// screen-reader friendly). Esc / backdrop / × close. Copy lives in
// src/instructions.md; the same copy is a shareable page at /help.
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
              {renderMarkdown(instructionsMd)}
              <p className="info-modal__share">
                <Link to="/help" onClick={() => setOpen(false)}>Open as a shareable page ↗</Link>
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
