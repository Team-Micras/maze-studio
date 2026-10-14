/**
 * New mazes from the New maze menu (PLAN.md 3.4, DESIGN.md 9.2): a preset or a custom size, named
 * "Untitled maze" through `uniqueName` unless named in the dialog, open in the editor without a
 * route of their own, and written to My mazes only by their first edit, under their own name.
 *
 * @module
 */

import { looseKey, uniqueName } from '@/library';
import {
  borderedMaze,
  isMazeSide,
  presetMaze,
  presetProfile,
  type MazePreset,
  type Profile,
} from '@/maze';

import { sizeLabel } from './labels';
import type { OpenMaze } from './open-maze';

/** The name of a new maze before it is given one. */
export const UNTITLED = 'Untitled maze';

/** What the New maze menu asks for. */
export type NewMazeRequest =
  | { readonly kind: 'preset'; readonly preset: MazePreset }
  | {
      readonly kind: 'custom';
      readonly width: number;
      readonly height: number;
      readonly profile: Profile;
      readonly name: string;
    };

/** The menu's presets, in order, with their labels. */
export const PRESETS: readonly (readonly [MazePreset, string])[] = [
  ['classic', 'Classic, 16 × 16'],
  ['halfsize', 'Half size, 32 × 32'],
  ['training', 'Training, 16 × 16'],
];

/** The side a field of the Custom size dialog gives, or `undefined` outside 1 to 64. */
export function sideOf(text: string): number | undefined {
  const side = Number(text.trim());
  return text.trim() !== '' && isMazeSide(side) ? side : undefined;
}

/** The name a new maze gets: `name` if given, else "Untitled maze", unique among `taken`. */
export function newMazeName(name: string, taken: Iterable<string>): string {
  return uniqueName(name.trim() === '' ? UNTITLED : name.trim(), taken);
}

/**
 * The new maze `request` asks for, open under the `id`th new maze's key; its name is made unique among
 * the names of My mazes, `taken`.
 */
export function openNewMaze(
  request: NewMazeRequest,
  id: number,
  taken: Iterable<string>
): OpenMaze {
  const maze =
    request.kind === 'preset'
      ? presetMaze(request.preset)
      : borderedMaze(request.width, request.height);
  const profile = request.kind === 'preset' ? presetProfile(request.preset) : request.profile;
  return {
    key: looseKey('new', id),
    maze,
    name: newMazeName(request.kind === 'preset' ? '' : request.name, taken),
    detail: `New maze, ${sizeLabel(maze.width, maze.height)}`,
    document: { trailer: '', profile, created: true },
  };
}
