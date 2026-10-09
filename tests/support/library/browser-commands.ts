/**
 * The types of the browser commands the library's tests use, apart from their Node code in
 * `browser-deflate.ts` so the browser side compiles without Node's types.
 *
 * @module
 */

import type { BrowserCommands } from 'vitest/browser';

declare module 'vitest/browser' {
  interface BrowserCommands {
    /** `size` zero bytes, raw-deflated, in base64. */
    deflateZeros: (size: number) => Promise<string>;
  }
}

/** The browser commands, with the library's added. */
export type { BrowserCommands };
