import { afterEach, describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { READY_MESSAGE, THEME_MESSAGE } from '@/ui/embed/theme-message';
import { useEmbedTheme } from '@/ui/embed/use-embed-theme';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.classList.remove('dark');
  window.history.replaceState(null, '', window.location.pathname);
});

/** A `prefers-color-scheme: dark` query whose answer the test changes, announcing each change. */
class SystemTheme extends EventTarget {
  matches = false;

  /** Changes the system's theme to dark or light. */
  set(dark: boolean): void {
    this.matches = dark;
    this.dispatchEvent(new Event('change'));
  }
}

function stubSystemTheme(dark: boolean): SystemTheme {
  const system = new SystemTheme();
  system.matches = dark;
  vi.stubGlobal('matchMedia', () => system);
  return system;
}

function Themed() {
  useEmbedTheme();
  return null;
}

/** Mounts the hook with `query` in the address, as the embed's frame would have it. */
async function mountTheme(query = '?embed'): Promise<() => void> {
  window.history.replaceState(null, '', `${window.location.pathname}${query}`);
  const screen = await render(<Themed />);
  return () => screen.unmount();
}

function isDark(): boolean {
  return document.documentElement.classList.contains('dark');
}

function postTheme(data: unknown, source: MessageEventSource | null = window.parent): void {
  window.dispatchEvent(new MessageEvent('message', { data, source }));
}

describe('The theme of the embed', () => {
  test('tells the parent it is ready once it listens for the theme', async () => {
    const posted = vi.spyOn(window.parent, 'postMessage');
    const listened = vi.spyOn(window, 'addEventListener');
    await mountTheme();

    const listening = listened.mock.calls.findIndex(([type]) => type === 'message');

    expect(posted).toHaveBeenCalledExactlyOnceWith({ type: READY_MESSAGE }, '*');
    expect(listening).not.toBe(-1);
    expect(listened.mock.invocationCallOrder[listening]).toBeLessThan(
      posted.mock.invocationCallOrder[0] ?? 0
    );
  });

  test('applies a forced theme', async () => {
    stubSystemTheme(false);
    await mountTheme('?embed&theme=dark');

    expect(isDark()).toBe(true);
  });

  test("follows the system's as it changes", async () => {
    const system = stubSystemTheme(false);
    await mountTheme();

    expect(isDark()).toBe(false);
    system.set(true);
    expect(isDark()).toBe(true);
    system.set(false);
    expect(isDark()).toBe(false);
  });

  test("takes the frame's parent's message over the system's from then on", async () => {
    const system = stubSystemTheme(false);
    await mountTheme();

    postTheme({ type: THEME_MESSAGE, theme: 'dark' });
    expect(isDark()).toBe(true);
    system.set(false);
    expect(isDark()).toBe(true);
    postTheme({ type: THEME_MESSAGE, theme: 'light' });
    expect(isDark()).toBe(false);
  });

  test('takes a message over a forced theme', async () => {
    await mountTheme('?embed&theme=light');

    expect(isDark()).toBe(false);
    postTheme({ type: THEME_MESSAGE, theme: 'dark' });
    expect(isDark()).toBe(true);
  });

  test('ignores a message from anywhere but the parent, or of another shape', async () => {
    stubSystemTheme(false);
    await mountTheme();

    postTheme({ type: THEME_MESSAGE, theme: 'dark' }, window);
    postTheme({ type: THEME_MESSAGE, theme: 'dark' }, null);
    postTheme({ type: 'theme', theme: 'dark' });
    postTheme('dark');
    expect(isDark()).toBe(false);
  });

  test('leaves the theme alone once unmounted', async () => {
    const system = stubSystemTheme(false);
    const unmount = await mountTheme();

    unmount();
    postTheme({ type: THEME_MESSAGE, theme: 'dark' });
    system.set(true);
    expect(isDark()).toBe(false);
  });
});
