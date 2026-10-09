/**
 * Real touches through the Chrome DevTools Protocol. Synthetic touch pointers cannot be captured,
 * so a pinch has to come from the browser's own input. The test page runs in an iframe that the
 * runner may scale, so points are given in the page's own CSS pixels and turned into the
 * top-level page's here.
 *
 * @module
 */

import type { CDPSession } from '@vitest/browser-playwright';
import { cdp } from 'vitest/browser';

/** A point in the test page's CSS pixels. */
export interface TouchPoint {
  readonly x: number;
  readonly y: number;
}

function toTopLevel(point: TouchPoint): TouchPoint {
  const frame = window.frameElement?.getBoundingClientRect();

  if (frame === undefined) {
    return point;
  }

  const scale = frame.width / window.innerWidth;
  return { x: frame.left + point.x * scale, y: frame.top + point.y * scale };
}

async function dispatch(
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  points: readonly TouchPoint[]
) {
  const session: CDPSession = cdp();
  await session.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: points.map((point, index) => ({ ...toTopLevel(point), id: index + 1 })),
  });
}

/** Two fingers going down at `from`, moving to `to` in `steps` steps, and lifting. */
export async function pinch(
  from: readonly [TouchPoint, TouchPoint],
  to: readonly [TouchPoint, TouchPoint],
  steps = 8
): Promise<void> {
  await dispatch('touchStart', from);

  for (let step = 1; step <= steps; step++) {
    const share = step / steps;
    await dispatch(
      'touchMove',
      from.map((point, index) => ({
        x: point.x + ((to[index]?.x ?? point.x) - point.x) * share,
        y: point.y + ((to[index]?.y ?? point.y) - point.y) * share,
      }))
    );
  }

  await dispatch('touchEnd', []);
}
