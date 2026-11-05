/**
 * The shortest routes and the flood-fill search of a maze together, as a worker searches and
 * answers them.
 *
 * @module
 */

import { explorationMemo, type Exploration } from './exploration';
import type { Maze } from './maze';
import { routesMemo, type ShortestRoutes } from './shortest-routes';

/** The shortest routes and the flood-fill search of a maze. */
export interface MazeSearches {
  readonly routes: ShortestRoutes | null | undefined;
  readonly exploration: Exploration | null | undefined;
}

/**
 * Remembers `searches` as those of `maze`, searched elsewhere, as in a worker; what is known
 * already stays, so the objects drawn and played keep their identity.
 */
export function rememberSearches(maze: Maze, { routes, exploration }: MazeSearches): void {
  if (!routesMemo.known(maze)) {
    routesMemo.remember(maze, routes);
  }

  if (!explorationMemo.known(maze)) {
    explorationMemo.remember(maze, exploration);
  }
}

/**
 * Whether the searches of `maze` that `wanted` names, both unless told, are known, so they need
 * no search again.
 */
export function searchesKnown(
  maze: Maze,
  wanted: Readonly<Record<keyof MazeSearches, boolean>> = { routes: true, exploration: true }
): boolean {
  return (
    (!wanted.routes || routesMemo.known(maze)) &&
    (!wanted.exploration || explorationMemo.known(maze))
  );
}
