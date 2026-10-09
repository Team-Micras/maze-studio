/**
 * The minimap's arithmetic (PLAN.md 3.4, DESIGN.md 9.2): when it shows, how large it is, where
 * the visible area falls on it, and which world point a click on it means.
 *
 * @module
 */

import {
  visibleWorld,
  type Camera,
  type ScreenPoint,
  type ViewportSize,
  type WorldPoint,
  type WorldRect,
} from './camera';

/** The minimap's longest side on a notebook, in CSS pixels. */
export const MINIMAP_SIZE = 148;

/** The minimap shows only past this many times the fit. */
export const MINIMAP_ZOOM_THRESHOLD = 1.06;

/** A rectangle on the minimap, in CSS pixels from its board's top-left corner. */
export interface MinimapRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The minimap's board: its size in CSS pixels and the pixels per world unit. */
export interface MinimapFrame {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}

/** Whether the minimap shows at zoom `k` when the fit is `fitK`. */
export function showsMinimap(k: number, fitK: number): boolean {
  return k > fitK * MINIMAP_ZOOM_THRESHOLD;
}

/** The minimap of `board` with its longest side `size` pixels long. */
export function minimapFrame(board: WorldRect, size = MINIMAP_SIZE): MinimapFrame {
  const scale = size / Math.max(board.width, board.height);
  return { width: board.width * scale, height: board.height * scale, scale };
}

/** The part of the board the viewport shows, on the minimap, cut to the minimap's board. */
export function minimapView(
  camera: Camera,
  viewport: ViewportSize,
  board: WorldRect,
  frame: MinimapFrame
): MinimapRect {
  const visible = visibleWorld(camera, viewport);
  const clampX = (value: number): number => Math.min(Math.max(value, 0), frame.width);
  const clampY = (value: number): number => Math.min(Math.max(value, 0), frame.height);
  const left = clampX((visible.x - board.x) * frame.scale);
  const top = clampY((visible.y - board.y) * frame.scale);
  const right = clampX((visible.x + visible.width - board.x) * frame.scale);
  const bottom = clampY((visible.y + visible.height - board.y) * frame.scale);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The world point at `point`, given in pixels from the minimap board's top-left corner. */
export function minimapWorldPoint(
  point: ScreenPoint,
  board: WorldRect,
  frame: MinimapFrame
): WorldPoint {
  return { x: board.x + point.x / frame.scale, y: board.y + point.y / frame.scale };
}
