/**
 * The theme (DESIGN.md 2.1): the one last picked in this browser, else the system's light or dark,
 * unless `?theme=light|dark` forces one. The `<meta name="theme-color">` follows the desk;
 * `index.html` reads the same choice before the first paint.
 *
 * @module
 */

import { create } from 'zustand';

/** The two themes. */
export type Theme = 'light' | 'dark';

/** The desk colour of each theme, for `<meta name="theme-color">`. */
export const DESK_COLORS: Readonly<Record<Theme, string>> = { light: '#ffffff', dark: '#191919' };

function themeOf(value: string | null): Theme | undefined {
  return value === 'light' || value === 'dark' ? value : undefined;
}

/** The theme `?theme=` forces, if any. */
export function forcedTheme(search: string): Theme | undefined {
  return themeOf(new URLSearchParams(search).get('theme'));
}

/** Where the theme picked last is kept, which `index.html` reads too. */
const THEME_KEY = 'maze-studio:theme';

function pickedTheme(): Theme | undefined {
  try {
    return themeOf(localStorage.getItem(THEME_KEY));
  } catch {
    return undefined;
  }
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

/** The theme, kept in this browser once picked. */
export const useTheme = create<ThemeState>()((set, get) => ({
  theme: forcedTheme(window.location.search) ?? pickedTheme() ?? systemTheme(),
  toggle: () => {
    const theme = get().theme === 'dark' ? 'light' : 'dark';
    applyTheme(theme);
    set({ theme });

    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      return;
    }
  },
}));
