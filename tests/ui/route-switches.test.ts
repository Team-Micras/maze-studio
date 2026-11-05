import { describe, expect, test } from 'vitest';

import { explore, presetMaze, shortestRoutes } from '@/maze';
import { NO_OVERLAYS, shownOverlays } from '@/ui/route-switches';

describe('shownOverlays', () => {
  test('gives the routes and the search switched on, and nothing with all off or no routes', () => {
    const maze = presetMaze('classic');
    const routes = shortestRoutes(maze);

    expect(shownOverlays(maze, { ...NO_OVERLAYS, withDiagonals: true })).toEqual({
      routes: { withoutDiagonals: undefined, withDiagonals: routes?.withDiagonals },
      exploration: undefined,
    });
    expect(shownOverlays(maze, { ...NO_OVERLAYS, exploration: true })).toEqual({
      routes: undefined,
      exploration: explore(maze),
    });
    expect(shownOverlays(maze, NO_OVERLAYS)).toEqual({ routes: undefined, exploration: undefined });
    expect(
      shownOverlays(
        { ...maze, start: undefined },
        { withoutDiagonals: true, withDiagonals: true, exploration: true }
      )
    ).toEqual({ routes: undefined, exploration: undefined });
  });
});
