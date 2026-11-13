import { useEffect, useState } from 'react';

const KEY = 'researchmesh.theme';
const read = () => {
  try { return localStorage.getItem(KEY) || 'system'; } catch { return 'system'; }
};

/** Apply the saved theme before first paint (called from main.jsx). */
export function applySavedTheme() {
  const t = read();
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

const NEXT = { system: 'light', light: 'dark', dark: 'system' };
const ICON = { system: '◐', light: '☀', dark: '☾' };
const LABEL = { system: 'Theme: follows your system', light: 'Theme: light', dark: 'Theme: dark' };

export function ThemeToggle() {
  const [theme, setTheme] = useState(read);
  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(KEY, theme); } catch { /* private mode */ }
  }, [theme]);
  return (
    <button className="icon-btn theme-toggle" title={`${LABEL[theme]} — click to change`} aria-label={LABEL[theme]} onClick={() => setTheme(NEXT[theme])}>
      <span key={theme} className="spin-in">{ICON[theme]}</span>
    </button>
  );
}
