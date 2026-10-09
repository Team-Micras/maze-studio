/**
 * The state of the studio, one store per studio: whether the library or a maze is on screen or a
 * flight is between them, where the open maze lies, and the quick list.
 *
 * @module
 */

import { createStore, type StoreApi } from 'zustand/vanilla';

import type { WorldPoint } from '@/render';
import type { OpenMaze } from '@/ui/open-maze';

/** The library, a maze, or a flight from one to the other (DESIGN.md 8). */
export type StudioMode = 'library' | 'flying-in' | 'editor' | 'flying-out';

/** The flight into a maze, in milliseconds. */
export const FLIGHT_IN_MS = 620;

/** The flight back to the library, in milliseconds. */
export const FLIGHT_OUT_MS = 520;

/** How far into the flight in the editor's islands appear. */
export const CHROME_IN_AT = 0.62;

/** Where a maze that has no artboard in the library, from a link or a file, lies in the world. */
export const LOOSE_CELL: WorldPoint = { x: -4000, y: 0 };

/** What the studio shows. */
export interface StudioState {
  readonly mode: StudioMode;
  /** Whether the editor's islands show during the flight in. */
  readonly chromeIn: boolean;
  /** The cell of the grid the open maze lies in, the cell of the artboard it was opened from. */
  readonly cell: WorldPoint;
  /** Whether the maze is open to look at, one finger panning, as on a phone or after a touch. */
  readonly viewing: boolean;
  /** The library's zoom when the maze was opened, for the thumbnails left behind. */
  readonly libraryZoom: number | undefined;
  /** The maze shown during the flight back, after the route has left it. */
  readonly leaving: OpenMaze | undefined;
  /** The catalog key of the maze the quick list previews, if not the one open. */
  readonly preview: string | undefined;
  readonly listOpen: boolean;
}

/** The studio's state at the start: the library. */
export const INITIAL_STUDIO: StudioState = {
  mode: 'library',
  chromeIn: false,
  cell: LOOSE_CELL,
  viewing: false,
  libraryZoom: undefined,
  leaving: undefined,
  preview: undefined,
  listOpen: false,
};

/** A new store of the studio's state. */
export function createStudioStore(): StoreApi<StudioState> {
  return createStore<StudioState>()(() => INITIAL_STUDIO);
}
