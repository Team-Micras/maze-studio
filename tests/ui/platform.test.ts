import { afterEach, describe, expect, test, vi } from 'vitest';

import { shortcutLabel } from '@/ui/platform';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('A shortcut label', () => {
  test('reads ⌘ on a Mac by the client hints, before the old platform string', () => {
    vi.stubGlobal('navigator', { userAgentData: { platform: 'macOS' }, platform: 'Linux x86_64' });

    expect(shortcutLabel('Ctrl Shift Z')).toBe('⌘ Shift Z');
  });

  test('falls back to the platform string without client hints', () => {
    vi.stubGlobal('navigator', { platform: 'iPhone' });
    expect(shortcutLabel('Ctrl Z')).toBe('⌘ Z');
    vi.stubGlobal('navigator', { userAgentData: { platform: '' }, platform: 'Win32' });
    expect(shortcutLabel('Ctrl Z')).toBe('Ctrl Z');
  });
});
