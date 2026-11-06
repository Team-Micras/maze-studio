/**
 * Plane-to-plane homographies: fitting one to point pairs by the direct linear transform, and
 * applying it.
 *
 * @module
 */

/** A point of a plane. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A 3 × 3 projective map, row by row, normalised so that its last entry is 1. */
export type Homography = readonly number[];

/** The similarity that moves `points` to their centroid and scales their mean distance to √2. */
function normaliser(points: readonly Point[]): Homography {
  const cx = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const cy = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const spread =
    points.reduce((sum, point) => sum + Math.sqrt((point.x - cx) ** 2 + (point.y - cy) ** 2), 0) /
    points.length;
  const k = spread > 0 ? Math.SQRT2 / spread : 1;
  return [k, 0, -k * cx, 0, k, -k * cy, 0, 0, 1];
}

function multiply(a: Homography, b: Homography): number[] {
  return Array.from({ length: 9 }, (_, index) => {
    const row = Math.floor(index / 3);
    const column = index % 3;
    return a[row * 3] * b[column] + a[row * 3 + 1] * b[3 + column] + a[row * 3 + 2] * b[6 + column];
  });
}

/** The solution of the square system `a · x = b`, by Gaussian elimination with partial pivoting. */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length;

  for (let column = 0; column < n; column++) {
    let pivot = column;

    for (let row = column + 1; row < n; row++) {
      if (Math.abs(a[row][column]) > Math.abs(a[pivot][column])) {
        pivot = row;
      }
    }

    if (Math.abs(a[pivot][column]) < 1e-12) {
      throw new RangeError('the points do not determine a homography');
    }

    [a[column], a[pivot]] = [a[pivot], a[column]];
    [b[column], b[pivot]] = [b[pivot], b[column]];

    for (let row = column + 1; row < n; row++) {
      const factor = a[row][column] / a[column][column];

      for (let k = column; k < n; k++) {
        a[row][k] -= factor * a[column][k];
      }

      b[row] -= factor * b[column];
    }
  }

  const x = Array.from({ length: n }, () => 0);

  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row];

    for (let k = row + 1; k < n; k++) {
      sum -= a[row][k] * x[k];
    }

    x[row] = sum / a[row][row];
  }

  return x;
}

/** The inverse of a homography, by its adjugate. */
export function invertHomography(h: Homography): Homography {
  const [a, b, c, d, e, f, g, i, j] = h;
  const adjugate = [
    e * j - f * i,
    c * i - b * j,
    b * f - c * e,
    f * g - d * j,
    a * j - c * g,
    c * d - a * f,
    d * i - e * g,
    b * g - a * i,
    a * e - b * d,
  ];
  return adjugate.map((value) => value / adjugate[8]);
}

/**
 * The homography that maps each of `from` onto the point of `to` at the same index: exact for four
 * pairs in general position, the least-squares fit for more. The points are normalised first, as
 * Hartley advises, so that pixel coordinates in the thousands stay well conditioned.
 *
 * Degenerate points (three on a line, or repeated) give a meaningless homography, so callers check
 * them first.
 *
 * @throws {RangeError} When there are fewer than four pairs, or the fit has no solution.
 */
export function fitHomography(from: readonly Point[], to: readonly Point[]): Homography {
  if (from.length !== to.length || from.length < 4) {
    throw new RangeError(`a homography needs four or more point pairs, not ${from.length}`);
  }

  const tFrom = normaliser(from);
  const tTo = normaliser(to);
  const normal = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => 0));
  const right = Array.from({ length: 8 }, () => 0);

  for (let index = 0; index < from.length; index++) {
    const p = applyHomography(tFrom, from[index]);
    const q = applyHomography(tTo, to[index]);
    const rows: [number[], number][] = [
      [[p.x, p.y, 1, 0, 0, 0, -p.x * q.x, -p.y * q.x], q.x],
      [[0, 0, 0, p.x, p.y, 1, -p.x * q.y, -p.y * q.y], q.y],
    ];

    for (const [row, value] of rows) {
      for (let i = 0; i < 8; i++) {
        right[i] += row[i] * value;

        for (let j = 0; j < 8; j++) {
          normal[i][j] += row[i] * row[j];
        }
      }
    }
  }

  const fitted = [...solve(normal, right), 1];
  const h = multiply(invertHomography(tTo), multiply(fitted, tFrom));
  return h.map((value) => value / h[8]);
}

/** Where `h` maps `point`. */
export function applyHomography(h: Homography, point: Point): Point {
  const w = h[6] * point.x + h[7] * point.y + h[8];
  return {
    x: (h[0] * point.x + h[1] * point.y + h[2]) / w,
    y: (h[3] * point.x + h[4] * point.y + h[5]) / w,
  };
}
