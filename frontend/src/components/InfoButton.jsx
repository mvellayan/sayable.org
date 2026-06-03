import React, { useState, useEffect, useRef } from "react";
import instructionsMd from "../instructions.md?raw";

// Inline **bold** → <strong>; everything else passes through as text.
function renderInline(text, k) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? <strong key={`${k}-b${i}`}>{part}</strong> : part
  );
}

// Minimal markdown → the how-to modal's existing styles. Supports the subset
// instructions.md uses: `# ` title, `> ` lede, `## ` section headings, `- `
// bullet lists, `---` (everything after it is footnote-styled), and **bold**.
// Edit src/instructions.md to change the copy — no code change needed.
function renderMarkdown(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let list = null;
  let afterRule = false;
  let key = 0;
  const flushList = () => {
    if (!list) return;
    const items = list;
    blocks.push(
      <ul key={`ul${key++}`}>
        {items.map((it, i) => <li key={i}>{renderInline(it, `li${key}-${i}`)}</li>)}
      </ul>
    );
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushList(); continue; }
    if (line === "---") { flushList(); afterRule = true; continue; }
    if (line.startsWith("- ")) { (list ||= []).push(line.slice(2)); continue; }
    flushList();
    if (line.startsWith("# ")) {
      blocks.push(<h2 key={`b${key++}`} className="info-modal__title">{renderInline(line.slice(2), `t${key}`)}</h2>);
    } else if (line.startsWith("### ")) {
      blocks.push(<h3 key={`b${key++}`}>{renderInline(line.slice(4), `h${key}`)}</h3>);
    } else if (line.startsWith("## ")) {
      blocks.push(<h3 key={`b${key++}`}>{renderInline(line.slice(3), `h${key}`)}</h3>);
    } else if (line.startsWith("> ")) {
      blocks.push(<p key={`b${key++}`} className="info-modal__lede">{renderInline(line.slice(2), `l${key}`)}</p>);
    } else {
      blocks.push(<p key={`b${key++}`} className={afterRule ? "info-modal__foot" : undefined}>{renderInline(line, `p${key}`)}</p>);
    }
  }
  flushList();
  return blocks;
}

// "i" icon → a quiet how-to modal. 44px tap target; focus moves into the modal on
// open, is trapped while open, and returns to the trigger on close (keyboard +
// screen-reader friendly). Esc / backdrop / × close. Copy lives in
// src/instructions.md.
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
            </div>
          </div>
        </div>
      )}
    </>
  );
}
