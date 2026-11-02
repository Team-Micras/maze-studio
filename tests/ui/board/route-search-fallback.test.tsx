import { afterAll, describe, expect, test, vi } from 'vitest';

import { routesKnown, shortestRoutes, type Maze } from '@/maze';
import type { RoutesFound } from '@/ui/board/route-search';
import { prefetchRoutes, requestRoutes } from '@/ui/board/route-search';
import { REPO_MAZES, repoMaze } from '@tests/support/ui/repo-mazes';

let answer: (code: string) => Event = () => new Event('none');

vi.stubGlobal(
  'Worker',
  /** A worker that answers each search with {@link answer}, the same one all along the file. */
  class extends EventTarget {
    postMessage(code: string): void {
      setTimeout(() => this.dispatchEvent(answer(code)));
    }

    terminate(): void {}
  }
);

function copies(maze: Maze, count: number): Maze[] {
  return Array.from({ length: count }, () => ({ ...maze }));
}

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('requestRoutes without a working worker', () => {
  test('searches a maze the worker failed on in idle time, and goes on with the next', async () => {
    answer = (code) =>
      new MessageEvent('message', {
        data: { code, routes: undefined, failed: true } satisfies RoutesFound,
      });
    const original = await repoMaze(REPO_MAZES.classic);
    const mazes = copies(original, 2);
    const found: Maze[] = [];
    mazes.forEach((maze) => requestRoutes(maze, false, () => found.push(maze)));

    await expect.poll(() => found).toEqual(mazes);
    expect(mazes.map((maze) => shortestRoutes(maze)?.withDiagonals.cells)).toEqual([
      shortestRoutes(original)?.withDiagonals.cells,
      shortestRoutes(original)?.withDiagonals.cells,
    ]);
  });

  test('gives up a worker that fails to load, and answers every request in idle time from then', async () => {
    answer = () => new ErrorEvent('error', { cancelable: true });
    const [inFlight, queued, prefetched, later] = copies(await repoMaze(REPO_MAZES.taiwan), 4);
    const found: Maze[] = [];
    requestRoutes(inFlight, false, () => found.push(inFlight));
    requestRoutes(queued, false, () => found.push(queued));
    prefetchRoutes([prefetched]);

    await expect.poll(() => found).toEqual([inFlight, queued]);
    requestRoutes(later, true, () => found.push(later));
    await expect.poll(() => found).toEqual([inFlight, queued, later]);
    expect(routesKnown(prefetched)).toBe(false);
  });
});
