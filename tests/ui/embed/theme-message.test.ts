import { describe, expect, test } from 'vitest';

import { THEME_MESSAGE, themeOfMessage } from '@/ui/embed/theme-message';

describe('The theme message', () => {
  test.each(['light', 'dark'] as const)('asks for %s', (theme) => {
    expect(themeOfMessage({ type: THEME_MESSAGE, theme })).toBe(theme);
    expect(themeOfMessage({ theme, type: 'maze-studio:theme' })).toBe(theme);
  });

  test('takes keys it does not know, for later versions', () => {
    expect(themeOfMessage({ type: THEME_MESSAGE, theme: 'dark', source: 'host' })).toBe('dark');
  });

  test.each([
    ['nothing', undefined],
    ['null', null],
    ['a string', 'maze-studio:theme dark'],
    ['an array', [THEME_MESSAGE, 'dark']],
    ['another type', { type: 'maze-studio:zoom', theme: 'dark' }],
    ['the ready message', { type: 'maze-studio:ready' }],
    ['another theme', { type: THEME_MESSAGE, theme: 'sepia' }],
    ['a theme in capitals', { type: THEME_MESSAGE, theme: 'Dark' }],
    ['no theme', { type: THEME_MESSAGE }],
  ])('is ignored as %s', (_shape, data) => {
    expect(themeOfMessage(data)).toBeUndefined();
  });
});
