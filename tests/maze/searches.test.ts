import { describe, expect, test } from 'vitest';

import { explore, presetMaze, rememberSearches, searchesKnown, shortestRoutes } from '@/maze';

describe('rememberSearches', () => {
  test('makes a maze known only once both searches are, and keeps what was known', () => {
    const maze = { ...presetMaze('classic') };
    const routes = shortestRoutes(maze);

    expect(searchesKnown(maze)).toBe(false);
    expect(searchesKnown(maze, { routes: true, exploration: false })).toBe(true);
    rememberSearches(maze, { routes: null, exploration: undefined });

    expect(searchesKnown(maze)).toBe(true);
    expect(shortestRoutes(maze)).toBe(routes);
    expect(explore(maze)).toBeUndefined();
  });
});
