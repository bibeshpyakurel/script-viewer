import { useEffect, useState } from 'react';

/** The two palettes defined in `app.css`. */
export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'script-viewer-theme';

/**
 * Dark, deliberately.
 *
 * This is a tool for reading dense structured data and the layout was designed
 * against the dark palette, so it is the default rather than a preference
 * inferred from the OS. A reader who wants light picks it, and that choice is
 * remembered.
 */
const DEFAULT_THEME: Theme = 'dark';

/** Read the saved theme, ignoring anything unrecognized. */
function readStoredTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : DEFAULT_THEME;
  } catch {
    // Storage can throw in private mode or with cookies blocked. A theme is not
    // worth breaking the page over, so fall back to the default.
    return DEFAULT_THEME;
  }
}

/**
 * Owns the active theme and mirrors it onto `<html data-theme>`.
 *
 * The attribute lives on the document element rather than on a wrapper div so
 * that `body` and anything portalled outside the React tree still inherit the
 * palette.
 */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Persisting is a nicety; the theme still applies for this session.
    }
  }, [theme]);

  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}

/**
 * The header control for switching palettes.
 *
 * Labelled with the theme it will switch TO, which is the less ambiguous of the
 * two conventions — a button reading "Light" next to a dark page is a promise
 * about what happens on click, not a claim about the current state. `aria-pressed`
 * carries the actual state for assistive tech, where the visual context that
 * makes the label obvious is missing.
 */
export function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: Theme;
  onToggle: () => void;
}) {
  const next: Theme = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={onToggle}
      aria-pressed={theme === 'light'}
      title={`Switch to ${next} theme`}
    >
      <span className="theme-icon" aria-hidden="true">
        {next === 'light' ? <SunIcon /> : <MoonIcon />}
      </span>
      <span className="theme-label">{next === 'light' ? 'Light' : 'Dark'}</span>
      <span className="sr-only">theme</span>
    </button>
  );
}

/* Inline SVGs rather than emoji: emoji render differently on every platform and
   several sun/moon glyphs are colour-fixed, which fights the palette. */

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
