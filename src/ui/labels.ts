/**
 * Words the screens show for values of the model.
 *
 * @module
 */

import type { CatalogEntry } from '@/library';
import type { Profile } from '@/maze';

const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  classic: 'Classic',
  halfsize: 'Half size',
  training: 'Training',
  free: 'Free',
};

/** The name of a repository folder or a profile: `halfsize` is `Half size`. */
export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

/** A maze's size as the screens write it: `16 × 16`. */
export function sizeLabel(width: number, height: number): string {
  return `${width} × ${height}`;
}

/** The profiles in the order the screens offer them, with their names. */
export const PROFILE_NAMES: readonly (readonly [Profile, string])[] = [
  ['classic', 'Classic'],
  ['halfsize', 'Half size'],
  ['training', 'Training'],
  ['free', 'Free'],
];

/**
 * What a screen reader says for a maze in a list or a picture: `japan2011hef, Japan, 32 by 32`
 * (DESIGN.md 13), the competition only when the name tells it.
 */
export function artboardLabel(
  maze: Pick<CatalogEntry, 'name' | 'competition' | 'width' | 'height'>
): string {
  const size = `${maze.width} by ${maze.height}`;
  return maze.competition === undefined
    ? `${maze.name}, ${size}`
    : `${maze.name}, ${maze.competition}, ${size}`;
}
