/**
 * A radial lens and the projection of the board through it: board cells to the undistorted
 * image by a homography, then to photo pixels by the lens.
 *
 * @module
 */

import { applyHomography, type Homography, type Point } from './homography';

/**
 * Radial distortion about the photo's centre: an undistorted point `q` is seen at
 * `centre + (q − centre)(1 + k1 r²)`, with `r = |q − centre| / radius`.
 *
 * The centre is the middle of the photo with pixel centres at whole coordinates,
 * `((width − 1) / 2, (height − 1) / 2)`, and `radius` is half the photo's diagonal,
 * `hypot(width, height) / 2`. For a camera of focal length `f` pixels, OpenCV's coefficient is
 * `k1 · (f / radius)²`.
 */
export interface Lens {
  readonly centre: Point;
  readonly radius: number;
  readonly k1: number;
}

/** A board seen in a photo: board coordinates to the undistorted image, then the lens. */
export interface Camera {
  /** From board coordinates (cells, `(0, 0)` at the north-west corner) to undistorted pixels. */
  readonly homography: Homography;
  readonly lens: Lens;
}

/** The range of `k1` the recogniser accepts: barrel up to a strong fisheye, mild pincushion. */
export const K1_RANGE = [-0.5, 0.2] as const;

/** The lens of a `width × height` photo with coefficient `k1`. */
export function lensOf(width: number, height: number, k1 = 0): Lens {
  return {
    centre: { x: (width - 1) / 2, y: (height - 1) / 2 },
    radius: Math.hypot(width, height) / 2,
    k1,
  };
}

/**
 * The undistorted distance from the centre, in pixels, past which `lens` folds over: where
 * `1 + 3 k1 r²` reaches 0 and a farther point would be seen nearer the centre. Infinite when
 * `k1 ≥ 0`.
 */
export function foldRadius(lens: Lens): number {
  return lens.k1 < 0 ? lens.radius / Math.sqrt(-3 * lens.k1) : Number.POSITIVE_INFINITY;
}

/** Where `lens` shows the undistorted point `q`; `NaN` past the fold radius. */
export function distort(lens: Lens, q: Point): Point {
  const dx = q.x - lens.centre.x;
  const dy = q.y - lens.centre.y;
  const r2 = (dx * dx + dy * dy) / (lens.radius * lens.radius);

  if (lens.k1 < 0 && r2 * -3 * lens.k1 >= 1) {
    return { x: Number.NaN, y: Number.NaN };
  }

  const factor = 1 + lens.k1 * r2;
  return { x: lens.centre.x + dx * factor, y: lens.centre.y + dy * factor };
}

/**
 * The undistorted point `lens` shows at `p`, inside the fold radius, by Newton's method on the
 * radius; `NaN` where no point inside the fold radius is seen at `p`.
 */
export function undistort(lens: Lens, p: Point): Point {
  const dx = p.x - lens.centre.x;
  const dy = p.y - lens.centre.y;
  const seen = Math.hypot(dx, dy) / lens.radius;

  if (lens.k1 === 0 || seen === 0) {
    return p;
  }

  const fold = foldRadius(lens) / lens.radius;
  let r = seen;

  for (let step = 0; step < 20; step++) {
    const next = r - (r * (1 + lens.k1 * r * r) - seen) / (1 + 3 * lens.k1 * r * r);
    r = Math.min(Math.max(next, 0), fold);
  }

  if (!(r < fold) || Math.abs(r * (1 + lens.k1 * r * r) - seen) > 1e-7) {
    return { x: Number.NaN, y: Number.NaN };
  }

  const factor = r / seen;
  return { x: lens.centre.x + dx * factor, y: lens.centre.y + dy * factor };
}

/** Where `camera` shows the board point `point`, in photo pixels; `NaN` past the fold radius. */
export function project(camera: Camera, point: Point): Point {
  return distort(camera.lens, applyHomography(camera.homography, point));
}
