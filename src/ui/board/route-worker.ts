/**
 * The worker that searches the shortest routes of thumbnails, so a search never takes a frame's
 * or an idle period's time on the page: one maze per message, as its compact code, and its routes
 * back, or that the search failed.
 *
 * @module
 */

import { decodeMazeCode, shortestRoutes } from '@/maze';

import type { RoutesFound } from './route-search';

function search(code: string): RoutesFound {
  try {
    const decoded = decodeMazeCode(code);
    return { code, routes: decoded.ok ? shortestRoutes(decoded.value.maze) : undefined };
  } catch {
    return { code, routes: undefined, failed: true };
  }
}

self.addEventListener('message', (event: MessageEvent<string>) => postMessage(search(event.data)));
