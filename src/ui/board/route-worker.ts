/**
 * The worker that searches the shortest routes of thumbnails, so a search never takes a frame's
 * or an idle period's time on the page: one maze per message, as its compact code, and its routes
 * back.
 *
 * @module
 */

import { decodeMazeCode, shortestRoutes } from '@/maze';

import type { RoutesFound } from './route-search';

self.addEventListener('message', (event: MessageEvent<string>) => {
  const decoded = decodeMazeCode(event.data);
  const found: RoutesFound = {
    code: event.data,
    routes: decoded.ok ? shortestRoutes(decoded.value.maze) : undefined,
  };
  self.postMessage(found, { transfer: [] });
});
