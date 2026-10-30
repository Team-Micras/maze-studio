/**
 * A maze as a standalone SVG file, for a README or a pull request: the board the editor draws at
 * rest, with no camera and no overlays, in one string with no script, font or image to fetch.
 * Its colours are sRGB hex, since Inkscape, librsvg and ImageMagick paint `oklch()` black.
 *
 * @module
 */

import type { Maze } from '@/maze';

import { boardGeometry } from './geometry';
import { formatLength } from './path';
import { trackPaint } from './track-layers';

const OKLCH = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/;

function srgbChannel(linear: number): string {
  const encoded = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(Math.max(encoded, 0), 1) * 255)
    .toString(16)
    .padStart(2, '0');
}

/** An opaque `oklch(L C H)` colour as sRGB hex, clipped to the gamut; any other value as it is. */
function srgb(color: string): string {
  const match = OKLCH.exec(color);

  if (match === null) {
    return color;
  }

  const [, lightnessText = '', chromaText = '', hueText = ''] = match;
  const lightness = Number(lightnessText);
  const angle = (Number(hueText) * Math.PI) / 180;
  const a = Number(chromaText) * Math.cos(angle);
  const b = Number(chromaText) * Math.sin(angle);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return `#${[
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
    .map(srgbChannel)
    .join('')}`;
}

function attribute(name: string, value: string | number): string {
  const key = name.replaceAll(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  return `${key}="${typeof value === 'string' ? srgb(value) : value}"`;
}

/**
 * The SVG file of `maze` as the editor's board draws it, as many units on its longest side as the
 * board's artboard. The track is the same in both themes (DESIGN.md 2.2), so the file is too.
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
    paths +
    `</svg>`
  );
}
