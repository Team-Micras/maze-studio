/**
 * The types of the browser command the photo tests use, apart from its Node code in
 * `browser-photos.ts` so the browser side compiles without Node's types.
 *
 * @module
 */

import type { BrowserCommands } from 'vitest/browser';

declare module 'vitest/browser' {
  interface BrowserCommands {
    /** A file of the folder `MAZE_PHOTOS` names, in base64, or `null` when it is unset. */
    readMazePhoto: (path: string) => Promise<string | null>;
  }
}

/** The browser commands, with the photo tests' added. */
export type { BrowserCommands };
