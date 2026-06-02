// Light/dark theme. The pre-paint script in index.html sets the initial
// data-theme (localStorage override, else OS preference); this module reads and
// flips it at runtime. Tokens live in styles.css under :root / [data-theme="dark"].

const KEY = "sayable.theme";

export function getTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

export function setTheme(t) {
  const theme = t === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch (e) {
    /* private mode / storage disabled — theme still applies for this session */
  }
  // Keep the mobile status-bar color (PWA) in sync with the surface.
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute("content", theme === "dark" ? "#17140F" : "#F6F2EA");
  return theme;
}

export function toggleTheme() {
  return setTheme(getTheme() === "dark" ? "light" : "dark");
}
