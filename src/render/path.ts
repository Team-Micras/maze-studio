/**
 * SVG path data for the shapes of a board. The same strings fill an SVG `path` and a canvas
 * `Path2D`, so the board and its thumbnails draw from one description.
 *
 * @module
 */

import type { BoardRect } from './geometry';

/** A length written with at most two decimals, enough for a board 640 units across. */
export function formatLength(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

/** A closed rectangle. */
export function rectPath({ x, y, width, height }: BoardRect): string {
  const f = formatLength;
  return `M${f(x)} ${f(y)}h${f(width)}v${f(height)}h${f(-width)}z`;
}

/** A closed rectangle with corners rounded by `radius`, at most half its shorter side. */
export function roundedRectPath(rect: BoardRect, radius: number): string {
  const r = Math.min(radius, rect.width / 2, rect.height / 2);

  if (r <= 0) {
    return rectPath(rect);
  }

  const f = formatLength;
  const across = rect.width - 2 * r;
  const down = rect.height - 2 * r;
  const arc = (dx: number, dy: number): string => `a${f(r)} ${f(r)} 0 0 1 ${f(dx)} ${f(dy)}`;
  return (
    `M${f(rect.x + r)} ${f(rect.y)}h${f(across)}${arc(r, r)}v${f(down)}${arc(-r, r)}` +
    `h${f(-across)}${arc(-r, -r)}v${f(-down)}${arc(r, -r)}z`
  );
}

/** A closed circle. */
export function circlePath(centerX: number, centerY: number, radius: number): string {
  const f = formatLength;
  const arc = `a${f(radius)} ${f(radius)} 0 1 0`;
  return `M${f(centerX - radius)} ${f(centerY)}${arc} ${f(2 * radius)} 0${arc} ${f(-2 * radius)} 0z`;
}
