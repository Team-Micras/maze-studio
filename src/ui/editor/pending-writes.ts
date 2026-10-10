/**
 * The writes to Mine still on their way, across the app, so that a reload into a new version
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
