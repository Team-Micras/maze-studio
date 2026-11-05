/**
 * The writes to My mazes still on their way, across the app, so that a reload into a new version
 * waits for them (DESIGN.md 12).
 *
 * @module
 */

import { showToast } from '@/ui/toasts';

/** Something that writes, and says when it has nothing left to write. */
export interface Writer {
  idle(): Promise<void>;
}

const writers = new Set<Writer>();

/** Counts `writer` among those {@link writesSettled} waits for; the function returned stops. */
export function trackWriter(writer: Writer): () => void {
  writers.add(writer);
  return () => writers.delete(writer);
}

/** Resolves once every writer tracked has written what it was asked to. */
export async function writesSettled(): Promise<void> {
  await Promise.all([...writers].map((writer) => writer.idle()));
}

/** How long writes may take before the app says the browser's storage is not answering. */
export const SLOW_WRITE_MS = 10_000;

/** What the app says when writes take longer than {@link SLOW_WRITE_MS}. */
export const SLOW_WRITE = 'Saving is taking long. Close other tabs of Maze Studio';

const listeners = new Set<() => void>();
let busy = 0;
let slow: ReturnType<typeof setTimeout> | undefined;

function announce(): void {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Counts `done` as writes on their way until it settles, for {@link isWriting}, and says so once
 * when writes have been on their way for {@link SLOW_WRITE_MS} without a pause.
 */
export function noteWrites(done: Promise<void>): void {
  busy += 1;
  slow ??= setTimeout(() => showToast(SLOW_WRITE), SLOW_WRITE_MS);
  announce();
  const settle = (): void => {
    busy -= 1;

    if (busy === 0) {
      clearTimeout(slow);
      slow = undefined;
    }

    announce();
  };
  void done.then(settle, settle);
}

/** Whether writes noted by {@link noteWrites} are still on their way. */
export function isWriting(): boolean {
  return busy > 0;
}

/** Calls `listener` whenever {@link isWriting} may have changed; the function returned stops. */
export function onWritingChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
