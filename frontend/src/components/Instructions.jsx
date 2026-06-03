import React from "react";
import { Link } from "react-router-dom";
import instructionsMd from "../instructions.md?raw";
import { renderMarkdown } from "../markdown";
import ThemeToggle from "./ThemeToggle";

// Public, shareable how-to page at /help (no login required) — the same copy as
// the in-app "i" modal, rendered from src/instructions.md. Safe to send to
// anyone you're inviting so they know how Sayable works before they sign in.
export default function Instructions() {
  return (
    <div className="app">
      <div className="topbar">
        <h1 className="topbar__brand">Sayable.org</h1>
        <div className="topbar__actions">
          <ThemeToggle />
          <Link className="topbar__link" to="/">open app</Link>
        </div>
      </div>
      <div className="doc">
        <div className="info-modal__body">
          {renderMarkdown(instructionsMd)}
        </div>
      </div>
    </div>
  );
}
