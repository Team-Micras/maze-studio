import { describe, expect, test } from 'vitest';

import { DEFAULT_FILTER } from '@/library/library-filter';
import { LIBRARY_ROUTE, parseRoute, routeHash, type Route } from '@/ui/routes';

describe('The library route', () => {
  test('is #/ with the default filter and writes only the keys that differ', () => {
    expect(routeHash(LIBRARY_ROUTE)).toBe('#/');
    expect(
      routeHash({
        kind: 'library',
        filter: { source: 'mine', category: 'classic', query: 'japan' },
      })
    ).toBe('#/?src=mine&cat=classic&q=japan');
    expect(routeHash({ kind: 'library', filter: { ...DEFAULT_FILTER, query: 'japan 2011' } })).toBe(
      '#/?q=japan+2011'
    );
  });

  test('reads back the filter it wrote', () => {
    const filter = { source: 'mine', category: 'halfsize', query: '21 × 21 & more' } as const;

    expect(parseRoute(routeHash({ kind: 'library', filter }))).toEqual({ kind: 'library', filter });
  });

  test('reads an empty hash, a bare #/ and unknown values as the default', () => {
    expect(parseRoute('')).toEqual(LIBRARY_ROUTE);
    expect(parseRoute('#/')).toEqual(LIBRARY_ROUTE);
    expect(parseRoute('#/?src=nowhere&cat=giant')).toEqual(LIBRARY_ROUTE);
  });
});

describe('The routes of a maze', () => {
  test.each<[string, Route]>([
    ['#/repo/classic/japan2011.txt', { kind: 'repo', path: 'classic/japan2011.txt' }],
    [
      '#/mine/6f1c0b2e-1d7a-4c35-9f43-8a0f2b51e9aa',
      { kind: 'mine', id: '6f1c0b2e-1d7a-4c35-9f43-8a0f2b51e9aa' },
    ],
    ['#/folder/my%20maze.txt', { kind: 'folder', file: 'my maze.txt' }],
    ['#/m/ARAQAAAEAHcA', { kind: 'link', code: 'ARAQAAAEAHcA' }],
  ])('%s', (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
    expect(routeHash(route)).toBe(hash);
  });

  test('encode what a path needs and nothing more', () => {
    expect(routeHash({ kind: 'repo', path: 'other/a b#c.txt' })).toBe('#/repo/other/a%20b%23c.txt');
    expect(parseRoute('#/repo/other/a%20b%23c.txt')).toEqual({
      kind: 'repo',
      path: 'other/a b#c.txt',
    });
  });

  test('fall back to the library when the rest is missing or malformed', () => {
    expect(parseRoute('#/repo/')).toEqual(LIBRARY_ROUTE);
    expect(parseRoute('#/repo/classic//x.txt')).toEqual(LIBRARY_ROUTE);
    expect(parseRoute('#/repo/%E0%A4%A')).toEqual(LIBRARY_ROUTE);
    expect(parseRoute('#/elsewhere/x')).toEqual(LIBRARY_ROUTE);
  });
});
