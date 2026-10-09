/**
 * The timing curves of DESIGN.md 8, as functions of progress, so a camera animation can be
 * computed and tested without a browser.
 *
 * @module
 */

/** A timing function: progress from 0 to 1 in, eased progress out, 0 at 0 and 1 at 1. */
export type Easing = (progress: number) => number;

const NEWTON_STEPS = 8;
const BISECTION_STEPS = 32;
const PRECISION = 1e-7;

function bezierCoordinate(first: number, second: number, t: number): number {
  return ((1 - 3 * second + 3 * first) * t + (3 * second - 6 * first)) * t * t + 3 * first * t;
}

/**
 * The CSS `cubic-bezier(x1, y1, x2, y2)` timing function.
 *
 * @param x1 The first control point's progress, 0 to 1.
 * @param x2 The second control point's progress, 0 to 1.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Easing {
  const x = (t: number): number => bezierCoordinate(x1, x2, t);
  const y = (t: number): number => bezierCoordinate(y1, y2, t);
  const slope = (t: number): number =>
    3 * (1 - 3 * x2 + 3 * x1) * t * t + 2 * (3 * x2 - 6 * x1) * t + 3 * x1;

  const solve = (progress: number): number => {
    let t = progress;

    for (let step = 0; step < NEWTON_STEPS; step++) {
      const error = x(t) - progress;
      const derivative = slope(t);

      if (Math.abs(error) < PRECISION) {
        return t;
      }

      if (Math.abs(derivative) < PRECISION) {
        break;
      }

      t -= error / derivative;

      if (t < 0 || t > 1) {
        break;
      }
    }

    let low = 0;
    let high = 1;
    t = progress;

    for (let step = 0; step < BISECTION_STEPS && high - low > PRECISION; step++) {
      if (x(t) < progress) {
        low = t;
      } else {
        high = t;
      }

      t = (low + high) / 2;
    }

    return t;
  };

  return (progress) => {
    if (progress <= 0) {
      return 0;
    }

    if (progress >= 1) {
      return 1;
    }

    return y(solve(progress));
  };
}

/** The flight between the library and the editor: `cubic-bezier(0.45, 0, 0.12, 1)`. */
export const EASE_FLIGHT = cubicBezier(0.45, 0, 0.12, 1);

/** `--ease-out`, `cubic-bezier(0.23, 1, 0.32, 1)`: fit, reveal, reflow, fades. */
export const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);
