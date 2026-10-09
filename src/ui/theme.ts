/**
 * The theme (DESIGN.md 2.1): the system's light or dark, unless `?theme=light|dark` forces one;
 * the theme button changes it for the session. The `<meta name="theme-color">` follows the desk.
 *
 * @module
 */

import { create } from 'zustand';

/** The two themes. */
export type Theme = 'light' | 'dark';

/** The desk colour of each theme, for `<meta name="theme-color">`. */
export const DESK_COLORS: Readonly<Record<Theme, string>> = { light: '#e3e3e3', dark: '#191919' };

/** The theme `?theme=` forces, if any. */
export function forcedTheme(search: string): Theme | undefined {
  const value = new URLSearchParams(search).get('theme');
  return value === 'light' || value === 'dark' ? value : undefined;
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Puts `theme` on the document. */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', DESK_COLORS[theme]);
}

interface ThemeState {
  readonly theme: Theme;
  readonly toggle: () => void;
}

/** The session's theme. */
export const useTheme = create<ThemeState>()((set, get) => ({
  theme: forcedTheme(window.location.search) ?? systemTheme(),
  toggle: () => {
    const theme = get().theme === 'dark' ? 'light' : 'dark';
    applyTheme(theme);
    set({ theme });
  },
}));
