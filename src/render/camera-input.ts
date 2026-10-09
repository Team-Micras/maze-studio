/**
 * What a wheel event or a zoom key asks of the camera (DESIGN.md 7), read from plain values so
 * that the rules are tested without a browser: the wheel pans, Ctrl or Cmd with the wheel zooms
 * at the pointer, and `+` (also `=`), `-` and `0` zoom in, out and fit.
 *
 * @module
 */

import type { ViewportSize } from './camera';

/** The fields of a `WheelEvent` the camera reads. */
export interface WheelInput {
  readonly deltaX: number;
  readonly deltaY: number;
  /** 0 for pixels, 1 for lines, 2 for pages, as `WheelEvent.deltaMode`. */
  readonly deltaMode: number;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  /** The mouse buttons held, as `MouseEvent.buttons`. */
  readonly buttons: number;
}

/** What a wheel event asks: move the world by screen pixels, or zoom by a factor. */
export type WheelIntent =
  | { readonly kind: 'pan'; readonly dx: number; readonly dy: number }
  | { readonly kind: 'zoom'; readonly factor: number };

/** The zoom key asked for. */
export type ZoomKey = 'in' | 'out' | 'fit';

/** How much `+` and `-` zoom. */
export const KEY_ZOOM_FACTOR = 1.25;

/** Pixels per line when a wheel scrolls by lines. */
export const WHEEL_LINE_PIXELS = 16;

const TRACKPAD_MAX_DELTA = 50;
const TRACKPAD_ZOOM_RATE = 0.01;
const WHEEL_ZOOM_RATE = 0.0025;
const LINE_MODE = 1;
const PAGE_MODE = 2;
const PRIMARY_BUTTON = 1;

function scaled(delta: number, mode: number, page: number): number {
  if (mode === LINE_MODE) {
    return delta * WHEEL_LINE_PIXELS;
  }

  return mode === PAGE_MODE ? delta * page : delta;
}

/**
 * What a wheel event asks of the camera, or `undefined` when it is ignored because the primary
 * button is down, as during a stroke or a drag.
 *
 * Without Ctrl or Cmd it pans: horizontally by `deltaX`, plus `deltaY` while Shift is held, and
 * vertically by `deltaY` otherwise; the world moves against the scroll. With Ctrl or Cmd it zooms
 * by `exp(-deltaY × 0.01)` for a trackpad (pixel deltas under 50) and `exp(-deltaY × 0.0025)`
 * otherwise, after lines and pages are turned into pixels.
 */
export function wheelIntent(input: WheelInput, viewport: ViewportSize): WheelIntent | undefined {
  if ((input.buttons & PRIMARY_BUTTON) !== 0) {
    return undefined;
  }

  const deltaX = scaled(input.deltaX, input.deltaMode, viewport.width);
  const deltaY = scaled(input.deltaY, input.deltaMode, viewport.height);

  if (input.ctrlKey || input.metaKey) {
    const trackpad = input.deltaMode === 0 && Math.abs(input.deltaY) < TRACKPAD_MAX_DELTA;
    return {
      kind: 'zoom',
      factor: Math.exp(-deltaY * (trackpad ? TRACKPAD_ZOOM_RATE : WHEEL_ZOOM_RATE)),
    };
  }

  return input.shiftKey
    ? { kind: 'pan', dx: -(deltaX + deltaY), dy: 0 }
    : { kind: 'pan', dx: -deltaX, dy: -deltaY };
}

/** The zoom a key asks for, or `undefined` for any other key. */
export function zoomKey(key: string): ZoomKey | undefined {
  switch (key) {
    case '+':
    case '=':
      return 'in';
    case '-':
      return 'out';
    case '0':
      return 'fit';
    default:
      return undefined;
  }
}
