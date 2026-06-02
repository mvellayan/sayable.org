import React, { useState } from "react";
import { getTheme, toggleTheme } from "../theme";
import { useAuth } from "../auth";
import { api } from "../api";

// Sun/moon theme switch. Shows the icon of the mode you'll switch TO: a moon in
// light mode (→ dark), a sun in dark mode (→ light). Quiet, ink-muted, no chrome.
// When signed in, the choice is also saved to the account so it follows the user
// across devices; when signed out it stays a device-local (localStorage) default.
export default function ThemeToggle({ className = "" }) {
  const { token } = useAuth();
  const [theme, setThemeState] = useState(getTheme());
  const dark = theme === "dark";

  function flip() {
    const next = toggleTheme();
    setThemeState(next);
    if (token) api.saveTheme(next).catch(() => {}); // best-effort per-user persist
  }

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      onClick={flip}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.1 5.1l1.8 1.8M17.1 17.1l1.8 1.8M18.9 5.1l-1.8 1.8M6.9 17.1l-1.8 1.8" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 14.5A8 8 0 0 1 9.5 4 7 7 0 1 0 20 14.5z" />
    </svg>
  );
}
