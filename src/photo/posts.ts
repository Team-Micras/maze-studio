/**
 * Fitting the board and the lens to the posts the photo shows, which corrects corners placed a
 * little off and bends the board as a wide lens does.
 *
 * @module
 */

import { fitHomography, type Point } from './homography';
import { sampleBilinear, type Plane } from './image';
import { K1_RANGE, lensOf, project, undistort, type Camera } from './lens';

/**
 * A search for each post near its predicted spot: how far and in what steps, as shares of a cell,
 * and how much a spot gains for walls leaving it both east–west and north–south.
 */
export interface Search {
  readonly reach: number;
  readonly step: number;
  readonly crossing?: number;
}

/** How far along the walls from a post they are read, as a share of a cell. */
const ARM = 0.3;

/**
 * The weight of walls leaving a spot both east–west and north–south: a point on a straight wall
 * looks as much like a post as the post itself, and with corners all shifted along the walls the
 * nearest such point would win.
 */
const CROSSING = 0.5;

/**
 * The post searches, coarse to fine: the first reaches half a cell and favours spots where walls
 * cross, so corners a third of a cell off still find their own posts and not the next ones or a
 * point on a wall.
 */
const SEARCHES: readonly Search[] = [
  { reach: 0.5, step: 0.05, crossing: CROSSING },
  { reach: 0.15, step: 0.025 },
  { reach: 0.15, step: 0.025 },
];

/** The search that scores each lens of the first guess, held to the clicked corners. */
const LENS_SEARCH: Search = { reach: 0.2, step: 0.1 };

/** The steps of `k1` tried over all of {@link K1_RANGE}, coarse then fine, held to the corners. */
const CORNER_K1_STEPS = [0.05, 0.01] as const;

/**
 * The share of the posts' distance with no lens under which the lens's must fall, after the last
 * search, for the lens to be kept: a slight bend is left to the homography, since a lens fitted
 * to it costs undistorted photos frames with no wrong edge. Tuned on the open frames (6 distorted
 * ones from 3 events fall to 0.05–0.6, undistorted ones stay at 0.75–1) and set high, since
 * dropping a lens that is needed costs far more than keeping one that is not.
 */
const LENS_SHARE = 0.85;

/** How far `k1` may move in one refit to the posts. */
const POST_K1_REACH = 0.05;

/** The steps of `k1` tried in a refit to the posts, coarse then fine. */
const POST_K1_STEPS = [0.01, 0.001] as const;

/** Where the floor is read around a post, diagonally, as a share of a cell. */
const DIAGONAL = 0.35;

/** How much a share of a cell away from the predicted spot costs a candidate. */
const DISTANCE_COST = 0.1;

/** A found post's residual, past this many times the median, makes it an outlier. */
const OUTLIER_FACTOR = 2.5;

/** The residual past which a post counts the same however far it is, as a share of a cell. */
const TRUNCATION = 0.25;

/**
 * The photo pixels near the board point `post`, `camera` taken as affine there: a step of `(dx,
 * dy)` cells from `post`, or `undefined` when the neighbourhood crosses the fold radius.
 */
function near(camera: Camera, post: Point): ((dx: number, dy: number) => Point) | undefined {
  const [origin, east, west, south, north] = [
    [0, 0],
    [0.5, 0],
    [-0.5, 0],
    [0, 0.5],
    [0, -0.5],
  ].map(([dx, dy]) => project(camera, { x: post.x + dx, y: post.y + dy }));

  if (![origin, east, west, south, north].every(finite)) {
    return undefined;
  }

  return (dx, dy) => ({
    x: origin.x + (east.x - west.x) * dx + (south.x - north.x) * dy,
    y: origin.y + (east.y - west.y) * dx + (south.y - north.y) * dy,
  });
}

/**
 * How post-like the photo looks `(dx, dy)` cells from a post: light there, dark on the diagonals,
 * and, weighted by `crossing`, light both east or west and north or south.
 */
function postResponse(
  photo: Plane,
  at: (dx: number, dy: number) => Point,
  dx: number,
  dy: number,
  crossing: number
): number {
  const read = (x: number, y: number) => {
    const p = at(dx + x, dy + y);
    return sampleBilinear(photo, p.x, p.y);
  };
  const floor =
    (read(-DIAGONAL, -DIAGONAL) +
      read(DIAGONAL, -DIAGONAL) +
      read(-DIAGONAL, DIAGONAL) +
      read(DIAGONAL, DIAGONAL)) /
    4;
  const across = Math.min(
    Math.max(read(-ARM, 0), read(ARM, 0)),
    Math.max(read(0, -ARM), read(0, ARM))
  );
  return read(0, 0) - floor + crossing * (across - floor);
}

function distance(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function median(values: readonly number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function finite(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function square(size: number): Point[] {
  return [
    { x: 0, y: 0 },
    { x: size, y: 0 },
    { x: size, y: size },
    { x: 0, y: size },
  ];
}

/** The `k1` values from `from` to `to` in steps of `step`, both ends within {@link K1_RANGE}. */
function k1Values(from: number, to: number, step: number): number[] {
  const low = Math.max(from, K1_RANGE[0]);
  const high = Math.min(to, K1_RANGE[1]);
  return Array.from(
    { length: Math.floor((high - low) / step + 1e-9) + 1 },
    (_, index) => Math.round((low + index * step) * 1e6) / 1e6
  );
}

/**
 * The `k1` that `cost` finds lowest from `start` to `start ± reach` within {@link K1_RANGE}, on a
 * grid of each of `steps` in turn, each finer grid spanning one step of the last around its best.
 */
function bestK1(
  start: number,
  reach: number,
  steps: readonly number[],
  cost: (k1: number) => number
): number {
  let best = start;
  let lowest = cost(start);
  let [from, to] = [start - reach, start + reach];

  for (const step of steps) {
    for (const k1 of k1Values(from, to, step)) {
      const value = cost(k1);

      if (value < lowest) {
        best = k1;
        lowest = value;
      }
    }

    [from, to] = [best - step, best + step];
  }

  return best;
}

/** The posts of a `size × size` board and the spots of `photo` that look most like them. */
function searchPosts(
  photo: Plane,
  camera: Camera,
  size: number,
  { reach, step, crossing = 0 }: Search
): { grid: Point[]; found: Point[]; total: number; responses: number[] } {
  const grid: Point[] = [];
  const found: Point[] = [];
  const responses: number[] = Array.from({ length: (size + 1) * (size + 1) }, () => Number.NaN);
  const steps = Math.round(reach / step);
  let total = 0;

  for (let y = 0; y <= size; y++) {
    for (let x = 0; x <= size; x++) {
      const at = near(camera, { x, y });

      if (at === undefined) {
        continue;
      }

      let best = { response: Number.NEGATIVE_INFINITY, dx: 0, dy: 0 };

      for (let row = -steps; row <= steps; row++) {
        for (let column = -steps; column <= steps; column++) {
          const [dx, dy] = [column * step, row * step];
          const response =
            postResponse(photo, at, dx, dy, crossing) -
            DISTANCE_COST * Math.sqrt(dx * dx + dy * dy);

          if (response > best.response) {
            best = { response, dx, dy };
          }
        }
      }

      if (Number.isFinite(best.response)) {
        grid.push({ x, y });
        found.push(at(best.dx, best.dy));
        total += best.response;
        responses[y * (size + 1) + x] = best.response;
      }
    }
  }

  return { grid, found, total, responses };
}

/**
 * The camera with coefficient `k1` whose board corners fall on `corners`, or `undefined` when a
 * corner lies past the lens's fold radius.
 */
function throughCorners(
  photo: Plane,
  corners: readonly Point[],
  size: number,
  k1: number
): Camera | undefined {
  const lens = lensOf(photo.width, photo.height, k1);
  const seen = corners.map((corner) => undistort(lens, corner));
  return seen.every(finite) ? { homography: fitHomography(square(size), seen), lens } : undefined;
}

/** The pixels of a cell side, on average along the border of `camera`'s board. */
function cellPixels(camera: Camera, size: number): number {
  const corners = square(size).map((corner) => project(camera, corner));
  return (
    corners.reduce((sum, corner, index) => sum + distance(corner, corners[(index + 1) % 4]), 0) /
    (4 * size)
  );
}

/**
 * The camera with coefficient `k1` fitted to the posts `found` at `grid`: the homography to the
 * undistorted posts, refitted without those that disagree with it; `undefined` when too few posts
 * lie inside the fold radius or a board corner lies past it.
 */
function fitToPosts(
  photo: Plane,
  grid: readonly Point[],
  found: readonly Point[],
  size: number,
  k1: number
): Camera | undefined {
  const lens = lensOf(photo.width, photo.height, k1);
  const seen = found.map((point) => undistort(lens, point));
  let inliers = grid.map((_, index) => index).filter((index) => finite(seen[index]));
  let camera: Camera | undefined;

  for (let round = 0; round < 3 && inliers.length >= 4; round++) {
    camera = {
      homography: fitHomography(
        inliers.map((index) => grid[index]),
        inliers.map((index) => seen[index])
      ),
      lens,
    };
    const fitted = camera;
    const errors = inliers.map((index) => distance(project(fitted, grid[index]), found[index]));
    const limit = OUTLIER_FACTOR * Math.max(median(errors), 0.5);
    inliers = inliers.filter((_, k) => errors[k] <= limit);
  }

  return camera !== undefined && square(size).every((corner) => finite(project(camera, corner)))
    ? camera
    : undefined;
}

/**
 * The camera refitted on the posts of a `size × size` board: each post is looked for near where
 * `camera` puts it, within `search`, as the most post-like spot; the homography and the lens's
 * `k1` are fitted to the posts found, dropping those that disagree, and kept when they lie closer
 * to the posts than `camera` does, each post's distance capped at a quarter of a cell. The lens is
 * then kept only when that distance is under `lensShare` of the one with no lens.
 */
export function refinePosts(
  photo: Plane,
  camera: Camera,
  size: number,
  search: Search = SEARCHES[SEARCHES.length - 1],
  lensShare = 1
): Camera {
  const { grid, found } = searchPosts(photo, camera, size, search);

  if (grid.length < 4) {
    return camera;
  }

  const cap = (TRUNCATION * cellPixels(camera, size)) ** 2;
  const cost = (candidate: Camera | undefined) =>
    candidate === undefined
      ? Number.POSITIVE_INFINITY
      : grid.reduce((sum, point, index) => {
          const error = distance(project(candidate, point), found[index]) ** 2;
          return sum + (error < cap ? error : cap);
        }, 0);
  const k1 =
    lensShare > 0
      ? bestK1(camera.lens.k1, POST_K1_REACH, POST_K1_STEPS, (value) =>
          cost(fitToPosts(photo, grid, found, size, value))
        )
      : 0;
  const fitted = fitToPosts(photo, grid, found, size, k1);
  const lens = fitted !== undefined && cost(fitted) < cost(camera) ? fitted : camera;
  const plain = fitToPosts(photo, grid, found, size, 0);
  return plain === undefined || cost(lens) <= lensShare * cost(plain) ? lens : plain;
}

/** `camera` refitted to the posts through every search, the lens kept as {@link refinePosts} does. */
function fitThroughSearches(photo: Plane, camera: Camera, size: number, lensShare: number): Camera {
  let fitted = camera;

  for (const [index, search] of SEARCHES.entries()) {
    fitted = refinePosts(
      photo,
      fitted,
      size,
      search,
      index === SEARCHES.length - 1 || lensShare === 0 ? lensShare : 1
    );
  }

  return fitted;
}

/**
 * The camera of a `size × size` board whose corner posts are seen at `corners`: first the lens
 * that best shows posts where the board, held to the corners, puts them; then the board and the
 * lens refitted to the posts, from a search half a cell wide to a fine one, the lens dropped at
 * the end unless it brings the posts clearly closer than no lens. A lens chosen that way may only
 * make up for corners shifted the same way, so the board is also fitted with no lens at all, and
 * the one whose posts, over those both can sample, look more like posts on average is kept.
 *
 * @throws {RangeError} When the corners do not determine a homography.
 */
export function locateBoard(photo: Plane, corners: readonly Point[], size: number): Camera {
  const k1 = bestK1(0, Math.max(-K1_RANGE[0], K1_RANGE[1]), CORNER_K1_STEPS, (value) => {
    const candidate = throughCorners(photo, corners, size, value);
    return candidate === undefined
      ? Number.POSITIVE_INFINITY
      : -searchPosts(photo, candidate, size, LENS_SEARCH).total;
  });
  const start = throughCorners(photo, corners, size, k1);
  const flat = throughCorners(photo, corners, size, 0);

  if (start === undefined || flat === undefined) {
    throw new RangeError('the corners do not determine a homography');
  }

  const lensed = fitThroughSearches(photo, start, size, LENS_SHARE);

  if (k1 === 0) {
    return lensed;
  }

  const plain = fitThroughSearches(photo, flat, size, 0);
  const fine = SEARCHES[SEARCHES.length - 1];
  const withLens = searchPosts(photo, lensed, size, fine).responses;
  const without = searchPosts(photo, plain, size, fine).responses;
  const gain = withLens.reduce(
    (sum, response, index) =>
      Number.isNaN(response) || Number.isNaN(without[index])
        ? sum
        : sum + response - without[index],
    0
  );
  return gain > 0 ? lensed : plain;
}
