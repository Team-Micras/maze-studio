/**
 * The writes to My mazes still on their way, across the app, so that a reload into a new version
 * waits for them (DESIGN.md 12).
 *
 * @module
 */

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

const listeners = new Set<() => void>();
let busy = 0;

function announce(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Counts `done` as writes on their way until it settles, for {@link isWriting}. */
export function noteWrites(done: Promise<void>): void {
  busy += 1;
  announce();
  void done.then(
    () => {
      busy -= 1;
      announce();
    },
    () => {
      busy -= 1;
      announce();
    }
  );
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
