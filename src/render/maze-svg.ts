/**
 * A maze as a standalone SVG file, for a README or a pull request: the board the editor draws at
 * rest, with no camera and no overlays, in one string with no script, font or image to fetch.
 *
 * @module
 */

import type { Maze } from '@/maze';

import { boardGeometry } from './geometry';
import { formatLength } from './path';
import { trackPaint } from './track-layers';

/**
 * The ring of the board slab in the dark theme, the `0 0 0 1px` of `--slab-shadow` in
 * `src/ui/styles.css` (DESIGN.md 2.1): the floor is only 1.09 : 1 against a dark page.
 */
export const SLAB_RING = 'oklch(1 0 0 / 0.06)';

function attribute(name: string, value: string | number): string {
  return `${name.replaceAll(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}="${value}"`;
}

/**
 * The SVG file of `maze` as the editor's board draws it, as many units on its longest side as the
 * board's artboard. The track is the same in both themes; under `prefers-color-scheme: dark` the
 * board takes the slab's ring, as it does in the app.
 */
export function mazeSvg(maze: Maze): string {
  const geometry = boardGeometry(maze);
  const width = formatLength(geometry.width);
  const height = formatLength(geometry.height);
  const paths = trackPaint(maze, geometry)
    .filter((layer) => layer.d !== '')
    .map(
      ({ name: _name, ...paint }) =>
        `<path ${Object.entries(paint)
          .map(([key, value]) => attribute(key, value))
          .join(' ')}/>`
    )
    .join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<style>.slab{fill:none;stroke:none}@media (prefers-color-scheme:dark){.slab{stroke:${SLAB_RING}}}</style>` +
    paths +
    `<rect class="slab" x="0.5" y="0.5" width="${formatLength(geometry.width - 1)}" height="${formatLength(geometry.height - 1)}"/>` +
    `</svg>`
  );
}
