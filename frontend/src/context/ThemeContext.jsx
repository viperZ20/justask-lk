import { createContext, useContext, useState, useEffect, useCallback } from 'react';

// Follows the device setting by default, and remembers a manual choice.
//
// Two details worth knowing:
//  - The class goes on <html>, not <body>, so the page background is themed
//    too. Theming only <body> leaves a light strip when the page overscrolls.
//  - If the user has never chosen, we keep listening to the OS setting, so a
//    phone switching to dark at sunset switches the app with it. Once they
//    choose manually, that preference wins and the listener stops applying.

const STORE = 'jl_theme';
const ThemeContext = createContext(null);

function systemPrefersDark() {
  return typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem(STORE);
    if (saved === 'dark' || saved === 'light') return saved;
    return systemPrefersDark() ? 'dark' : 'light';
  });

  // Whether the user has made an explicit choice.
  const [pinned, setPinned] = useState(() => Boolean(localStorage.getItem(STORE)));

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    // Tells the browser to render form controls and scrollbars to match.
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  // Follow the OS until the user overrides it.
  useEffect(() => {
    if (pinned) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => setThemeState(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pinned]);

  const setTheme = useCallback((next) => {
    setThemeState(next);
    setPinned(true);
    localStorage.setItem(STORE, next);
  }, []);

  const toggle = useCallback(
    () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    [theme, setTheme]
  );

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme, pinned }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
