import { describe, expect, test } from 'vitest';

import { appHref, isEmbed } from '@/ui/embed/embed-url';

const PAGES = 'https://team-micras.github.io/maze-studio/';
const MAZE = '#/repo/classic/br2025-robochallenge-day1.txt';

describe('The embed key', () => {
  test.each([
    ['?embed', true],
    ['?embed=', true],
    ['?theme=dark&embed', true],
    ['?embed=0', true],
    ['', false],
    ['?theme=dark', false],
    ['?embedded', false],
  ])('%s turns the embed on: %s', (search, on) => {
    expect(isEmbed(search)).toBe(on);
  });
});

describe('The link out of the embed', () => {
  test('is the same maze in the whole app, without the embed key', () => {
    expect(appHref(`${PAGES}?embed${MAZE}`)).toBe(`${PAGES}${MAZE}`);
  });

  test('keeps the theme the embed was forced to', () => {
    expect(appHref(`${PAGES}?embed&theme=dark${MAZE}`)).toBe(`${PAGES}?theme=dark${MAZE}`);
    expect(appHref(`${PAGES}?theme=light&embed=1${MAZE}`)).toBe(`${PAGES}?theme=light${MAZE}`);
  });

  test('keeps a link route as it is', () => {
    expect(appHref('http://localhost:5173/?embed#/m/AQIDBA')).toBe(
      'http://localhost:5173/#/m/AQIDBA'
    );
  });
});
