import { describe, expect, test } from 'vitest';

import { routesKnown, shortestRoutes, type Maze } from '@/maze';
import { prefetchRoutes, requestRoutes } from '@/ui/board/route-search';
import { REPO_MAZES, repoMaze } from '@tests/support/ui/repo-mazes';

/** `count` copies of `maze`, each a maze of its own whose routes are not searched yet. */
function copies(maze: Maze, count: number): Maze[] {
  return Array.from({ length: count }, () => ({ ...maze }));
}

describe('requestRoutes', () => {
  test('searches in a worker the same routes as on the page, the mazes on screen first', async () => {
    const maze = await repoMaze(REPO_MAZES.halfsize);
    const [first, ...others] = copies(maze, 6);
    const onScreen = others.at(-1);
    const found: Maze[] = [];

    for (const each of [first, ...others]) {
      requestRoutes(each, each === onScreen, () => found.push(each));
    }

    await expect.poll(() => found.length).toBe(6);
    expect(found.slice(0, 2)).toEqual([first, onScreen]);
    expect(routesKnown(onScreen ?? maze)).toBe(true);
    expect(shortestRoutes(onScreen ?? maze)).toEqual(shortestRoutes(maze));
  });

  test('takes a request back, and prefetches the mazes given after the requests', async () => {
    const maze = await repoMaze(REPO_MAZES.classic);
    const [busy, dropped, asked, ...ahead] = copies(maze, 6);
    const found: Maze[] = [];
    requestRoutes(busy, false, () => found.push(busy));
    requestRoutes(dropped, false, () => found.push(dropped))();
    prefetchRoutes(ahead);
    requestRoutes(asked, false, () => found.push(asked));

    await expect.poll(() => ahead.every(routesKnown)).toBe(true);
    expect(found).toEqual([busy, asked]);
    expect(routesKnown(dropped)).toBe(false);
  });

  test('holds the prefetch while it is told to, and goes on once it may', async () => {
    const mazes = copies(await repoMaze(REPO_MAZES.taiwan), 4);
    let holding = true;
    prefetchRoutes(mazes, () => holding);
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(mazes.some(routesKnown)).toBe(false);
    holding = false;
    await expect.poll(() => mazes.every(routesKnown)).toBe(true);
  });
});
