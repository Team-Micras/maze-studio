/**
 * The shortest routes of thumbnails, searched in a worker (`route-worker.ts`), one maze at a
 * time: first the mazes of thumbnails on screen, then those of the others mounted, then the mazes
 * given to prefetch, unless held, as while the library's grid is flung. Each answer fills the
 * routes remembered per maze, which then paint without a search. Without workers, or once the
 * worker fails, as when its chunk is gone after an update, the search runs in idle time instead.
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

/** What the worker answers: the routes of the maze of `code`, or that its search `failed`. */
export interface RoutesFound {
  readonly code: string;
  readonly routes: ShortestRoutes | null | undefined;
  readonly failed?: true;
}

interface Request {
  readonly maze: Maze;
  urgent: boolean;
  readonly waiting: Set<() => void>;
}

/** How often, in milliseconds, a prefetch on hold checks whether it may go on. */
const HOLD_RETRY_MS = 100;

const queue = new Map<Maze, Request>();
let searching: { readonly request: Request; readonly code: string } | undefined;
let prefetched: Iterator<Maze> | undefined;
let held: () => boolean = () => false;
let retry: number | undefined;
let post: ((code: string) => void) | undefined;
let workerFailed = false;

function next(): Request | undefined {
  for (const request of queue.values()) {
    if (request.urgent) {
      return request;
    }
  }

  if (held()) {
    retry ??= window.setTimeout(() => {
      retry = undefined;
      pump();
    }, HOLD_RETRY_MS);
    return undefined;
  }

  const first = queue.values().next();

  if (!first.done) {
    return first.value;
  }

  for (let step = prefetched?.next(); step !== undefined && !step.done; step = prefetched?.next()) {
    if (!routesKnown(step.value)) {
      return { maze: step.value, urgent: false, waiting: new Set() };
    }
  }

  prefetched = undefined;
  return undefined;
}

function answer(found: RoutesFound): void {
  const done = searching;
  searching = undefined;

  if (done !== undefined && done.code === found.code) {
    const { request } = done;
    queue.delete(request.maze);

    if (found.failed === true) {
      searchInIdle(request);
    } else {
      rememberRoutes(request.maze, found.routes);
      request.waiting.forEach((resume) => resume());
    }
  }

  pump();
}

/**
 * Searches the routes of `request` on the page, in idle time, and resumes what waits for them;
 * a search that fails resumes nothing, so the thumbnail stays without routes.
 */
function searchInIdle(request: Request): void {
  schedulePaint(() => {
    if (request.waiting.size === 0) {
      return;
    }

    try {
      shortestRoutes(request.maze);
    } catch {
      return;
    }

    request.waiting.forEach((resume) => resume());
  });
}

/** Gives up the worker, as when its chunk fails to load, and searches all it was asked in idle time. */
function workerLost(): void {
  workerFailed = true;
  post = undefined;
  prefetched = undefined;
  const lost = new Set([
    ...(searching === undefined ? [] : [searching.request]),
    ...queue.values(),
  ]);
  searching = undefined;
  queue.clear();
  lost.forEach(searchInIdle);
}

function pump(): void {
  if (searching !== undefined) {
    return;
  }

  const request = next();

  if (request !== undefined) {
    searching = { request, code: encodeMazeCode(request.maze) };
    post ??= startWorker();
    post(searching.code);
  }
}

function startWorker(): (code: string) => void {
  const worker = new Worker(new URL('./route-worker.ts', import.meta.url), { type: 'module' });
  const fail = (event: Event): void => {
    event.preventDefault();
    worker.terminate();
    workerLost();
  };
  worker.addEventListener('message', (event: MessageEvent<RoutesFound>) => answer(event.data));
  worker.addEventListener('error', fail);
  worker.addEventListener('messageerror', fail);
  return (code) => worker.postMessage(code, []);
}

/**
 * Searches the routes of `maze` and calls `found` once they are remembered; an `urgent` maze, of a
 * thumbnail on screen, goes before the others. The function returned takes the request back.
 */
export function requestRoutes(maze: Maze, urgent: boolean, found: () => void): () => void {
  if (typeof Worker !== 'function' || workerFailed) {
    const alone: Request = { maze, urgent, waiting: new Set([found]) };
    searchInIdle(alone);
    return () => alone.waiting.delete(found);
  }

  const inFlight = searching?.request.maze === maze ? searching.request : undefined;
  const request = inFlight ?? queue.get(maze) ?? { maze, urgent, waiting: new Set<() => void>() };
  request.urgent ||= urgent;
  request.waiting.add(found);

  if (inFlight === undefined) {
    queue.set(maze, request);
  }

  pump();
  return () => {
    request.waiting.delete(found);

    if (request.waiting.size === 0 && request !== searching?.request) {
      queue.delete(maze);
    }
  };
}

/**
 * Searches the routes of `mazes` in the background, after every request, one at a time as the
 * worker is free and never while `hold` says so, as while the grid is flung, so that nothing of it
 * takes the main thread's time then; in place of the mazes given before, and `undefined` stops it.
 */
export function prefetchRoutes(
  mazes: Iterable<Maze> | undefined,
  hold: () => boolean = () => false
): void {
  prefetched =
    typeof Worker === 'function' && !workerFailed ? mazes?.[Symbol.iterator]() : undefined;
  held = hold;
  pump();
}
