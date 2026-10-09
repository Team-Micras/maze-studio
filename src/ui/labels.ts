/**
 * Words the screens show for values of the model.
 *
 * @module
 */

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
