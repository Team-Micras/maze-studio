/**
 * The state of the studio, one store per studio: whether the library or a maze is on screen or a
 * flight is between them, the quick list, and the editor's mode and tool.
 *
 * @module
 */

import { createStore, type StoreApi } from 'zustand/vanilla';

import type { Maze } from '@/maze';
import { artboardIn, type WorldRect } from '@/render';

import type { HintMessage } from '@/ui/editor/tool-hint';
import type { Tool } from '@/ui/editor/tools';
import type { OpenMaze } from '@/ui/open-maze';

/** The library, a maze, or a flight from one to the other (DESIGN.md 8). */
export type StudioMode = 'library' | 'flying-in' | 'editor' | 'flying-out';

/** The flight into a maze, in milliseconds. */
export const FLIGHT_IN_MS = 620;

/** The flight back to the library, in milliseconds. */
export const FLIGHT_OUT_MS = 520;

/** How far into the flight in the editor's islands appear. */
export const CHROME_IN_AT = 0.62;

/** Where the board of `maze` lies in the stage's world: 640 units on its longest side, at the origin. */
export function boardOf(maze: Pick<Maze, 'width' | 'height'>): WorldRect {
  return artboardIn({ x: 0, y: 0 }, maze);
}

/** What the studio shows. */
export interface StudioState {
  readonly mode: StudioMode;
  /** Whether the editor's islands show during the flight in. */
  readonly chromeIn: boolean;
  /** Whether the maze is open to look at, one finger panning, as on a phone or after a touch. */
  readonly viewing: boolean;
  /** Whether a touch opened the maze, so that edit mode offers the way back to view mode. */
  readonly touchOpened: boolean;
  /** The editor's tool; every maze opens in the wall tool. */
  readonly tool: Tool;
  /** The hint above the tools, if one was given. */
  readonly hint: HintMessage | undefined;
  /** The finding shown on the board, if any: the maze's key and the finding's. */
  readonly finding: { readonly maze: string; readonly key: string } | undefined;
  readonly helpOpen: boolean;
  /** The maze shown during the flight back, after the route has left it. */
  readonly leaving: OpenMaze | undefined;
  /** The catalog key of the maze the quick list previews, if not the one open. */
  readonly preview: string | undefined;
  readonly listOpen: boolean;
  /** The artboard pressed in the library, whose board is mounted hidden before the click opens it. */
  readonly prepared: string | undefined;
  /** Whether the Changes panel is open. */
  readonly changesOpen: boolean;
  /** Whether the board shows the diff of the maze on screen ("Show on board", `D`). */
  readonly showDiff: boolean;
  readonly renameOpen: boolean;
}

/** The studio's state at the start: the library. */
export const INITIAL_STUDIO: StudioState = {
  mode: 'library',
  chromeIn: false,
  viewing: false,
  touchOpened: false,
  tool: 'wall',
  hint: undefined,
  finding: undefined,
  helpOpen: false,
  leaving: undefined,
  preview: undefined,
  listOpen: false,
  prepared: undefined,
  changesOpen: false,
  showDiff: false,
  renameOpen: false,
};

/** A new store of the studio's state. */
export function createStudioStore(): StoreApi<StudioState> {
  return createStore<StudioState>()(() => INITIAL_STUDIO);
}
