/**
 * The shortest routes of thumbnails, searched in a worker (`route-worker.ts`), one maze at a
 * time: first the mazes of thumbnails on screen, then those of the others mounted, then the mazes
 * given to prefetch. Each answer fills the routes remembered per maze, which then paint without a
 * search. Without workers the search runs in idle time instead.
 *
 * @module
 */

import {
  encodeMazeCode,
  rememberRoutes,
  routesKnown,
  shortestRoutes,
  type Maze,
  type ShortestRoutes,
} from '@/maze';

import { schedulePaint } from './paint-queue';

/** What the worker answers: the routes of the maze of `code`. */
export interface RoutesFound {
  readonly code: string;
  readonly routes: ShortestRoutes | null | undefined;
}

interface Request {
  readonly maze: Maze;
  readonly code: string;
  urgent: boolean;
  readonly waiting: Set<() => void>;
}

const queue = new Map<Maze, Request>();
let searching: Request | undefined;
let prefetched: Iterator<Maze> | undefined;
let worker: Worker | undefined;

function next(): Request | undefined {
  for (const request of queue.values()) {
    if (request.urgent) {
      return request;
    }
  }

  const first = queue.values().next();

  if (!first.done) {
    return first.value;
  }

  for (let step = prefetched?.next(); step !== undefined && !step.done; step = prefetched?.next()) {
    if (!routesKnown(step.value)) {
      return {
        maze: step.value,
        code: encodeMazeCode(step.value),
        urgent: false,
        waiting: new Set(),
      };
    }
  }

  prefetched = undefined;
  return undefined;
}

function answer(found: RoutesFound): void {
  const done = searching;
  searching = undefined;

  if (done !== undefined && done.code === found.code) {
    queue.delete(done.maze);
    rememberRoutes(done.maze, found.routes);
    done.waiting.forEach((resume) => resume());
  }

  pump();
}

function pump(): void {
  if (searching !== undefined) {
    return;
  }

  searching = next();

  if (searching !== undefined) {
    worker ??= startWorker();
    worker.postMessage(searching.code, []);
  }
}

function startWorker(): Worker {
  const started = new Worker(new URL('./route-worker.ts', import.meta.url), { type: 'module' });
  started.addEventListener('message', (event: MessageEvent<RoutesFound>) => answer(event.data));
  return started;
}

/**
 * Searches the routes of `maze` and calls `found` once they are remembered; an `urgent` maze, of a
 * thumbnail on screen, goes before the others. The function returned takes the request back.
 */
export function requestRoutes(maze: Maze, urgent: boolean, found: () => void): () => void {
  if (typeof Worker !== 'function') {
    return schedulePaint(() => {
      shortestRoutes(maze);
      found();
    });
  }

  const request = (searching?.maze === maze ? searching : queue.get(maze)) ?? {
    maze,
    code: encodeMazeCode(maze),
    urgent,
    waiting: new Set<() => void>(),
  };
  request.urgent ||= urgent;
  request.waiting.add(found);

  if (request !== searching) {
    queue.set(maze, request);
  }

  pump();
  return () => {
    request.waiting.delete(found);

    if (request.waiting.size === 0 && request !== searching) {
      queue.delete(maze);
    }
  };
}

/**
 * Searches the routes of `mazes` in the background, after every request, one at a time as the
 * worker is free, in place of the mazes given before; `undefined` stops it.
 */
export function prefetchRoutes(mazes: Iterable<Maze> | undefined): void {
  prefetched = typeof Worker === 'function' ? mazes?.[Symbol.iterator]() : undefined;
  pump();
}
