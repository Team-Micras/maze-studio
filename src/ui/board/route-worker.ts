/**
 * The worker that searches the shortest routes and the flood-fill search of thumbnails, so a
 * search never takes a frame's or an idle period's time on the page: one maze per message, as its
 * compact code, and its routes and search back, or that the search failed.
 *
 * @module
 */

import { decodeMazeCode, explore, shortestRoutes } from '@/maze';

import type { RoutesFound } from './route-search';

function search(code: string): RoutesFound {
  try {
    const decoded = decodeMazeCode(code);
    return decoded.ok
      ? {
          code,
          routes: shortestRoutes(decoded.value.maze),
          exploration: explore(decoded.value.maze),
        }
      : { code, routes: undefined, exploration: undefined };
  } catch {
    return { code, routes: undefined, exploration: undefined, failed: true };
  }
}

self.addEventListener('message', (event: MessageEvent<string>) => postMessage(search(event.data)));
