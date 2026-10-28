/**
 * The loading animations of the generator (the mockup's `loading-core.js` and `live-lib.js`), in
 * grey, as a maze not built yet: a decorative maze swept by a diagonal wave for a maze waiting its
 * turn, and on the board the routes the generator is trying, then the newest snapshot of its
 * walls that reads as a maze. Walls are one byte per cell, the bitmask of the mazefiles binary
 * format (north 1, east 2, south 4, west 8), cell `y × size + x` from the south-west corner; what
 * the generator streams is passed in as plain data.
 *
 * @module
 */

import type { BoardGeometry } from './geometry';
import { toBoardPoint } from './geometry';
import { TRACK_COLORS } from './track-colors';
import type { Canvas2D } from './thumbnails';

/** A wall as a line from post to post, in cells: `u` east and `v` north from the south-west. */
export type LoadingLine = readonly [u1: number, v1: number, u2: number, v2: number];

/** A line and how bright it is drawn, from 0 (the floor) to 1 (full grey). */
export interface ShadedLine {
  readonly line: LoadingLine;
  readonly shade: number;
}

/** A route stroked through its cells' centres. */
export interface RouteStroke {
  readonly cells: readonly number[];
  readonly alpha: number;
  readonly bold: boolean;
}

/** What a loading canvas shows in one frame. */
export interface LoadingScene {
  readonly size: number;
  readonly lines: readonly ShadedLine[];
  readonly routes: readonly RouteStroke[];
}

/** A route the generator tried, and when it arrived. */
export interface TrailRoute {
  readonly cells: readonly number[];
  readonly at: number;
}

/** What the board knows of a maze being built. */
export interface LoadingTrack {
  /** Whether a snapshot arrived: a maze still waiting its turn shows the wave. */
  readonly started: boolean;
  /** The newest snapshot that reads as a maze ({@link looksLikeMaze}), once one came. */
  readonly walls: Uint8Array | null;
  /** The last routes tried, newest last. */
  readonly trail: readonly TrailRoute[];
}

/** A maze not started yet. */
export const WAITING: LoadingTrack = { started: false, walls: null, trail: [] };

/** One sweep of the wave, in milliseconds. */
export const WAVE_PERIOD = 1800;

/** How long a route tried stays on the board, fading out, in milliseconds. */
export const ROUTE_FADE = 500;

/** The crossfade from the grey skeleton to the maze built, in milliseconds. */
export const SETTLE = 300;

/** The routes the trail keeps: the newest, bold, and the ones before it. */
export const TRAIL = 9;

/** The shade of the skeleton without motion, and of the walls of a snapshot. */
export const STILL_SHADE = 0.3;
const SNAPSHOT_SHADE = 0.6;

const GREY = [150, 150, 150] as const;
/** {@link TRACK_COLORS.floor} in sRGB, which the grey is mixed over. */
const FLOOR = [16, 16, 16] as const;
const SHADE_STEPS = 40;

/** Every wall of `walls` once, as lines between posts. */
export function wallLines(walls: ArrayLike<number>, size: number): LoadingLine[] {
  const lines: LoadingLine[] = [];

  for (let c = 0; c < size * size; c++) {
    const x = c % size;
    const y = Math.floor(c / size);
    const w = walls[c] ?? 0;

    if (w & 1) {
      lines.push([x, y + 1, x + 1, y + 1]);
    }

    if (w & 2) {
      lines.push([x + 1, y, x + 1, y + 1]);
    }

    if (y === 0 && w & 4) {
      lines.push([x, 0, x + 1, 0]);
    }

    if (x === 0 && w & 8) {
      lines.push([0, y, 0, y + 1]);
    }
  }

  return lines;
}

/** The four sides of a board. */
export function borderLines(size: number): LoadingLine[] {
  return [
    [0, 0, size, 0],
    [size, 0, size, size],
    [size, size, 0, size],
    [0, size, 0, 0],
  ];
}

/** The goal of a decorative maze: 2 × 2 in the middle of 16 × 16, 3 × 3 off the centre of 32 × 32. */
export function decorativeGoals(size: number): number[] {
  const [from, side] = size === 32 ? [13, 3] : [size / 2 - 1, 2];
  const cells: number[] = [];

  for (let y = from; y < from + side; y++) {
    for (let x = from; x < from + side; x++) {
      cells.push(y * size + x);
    }
  }

  return cells;
}

const STEPS = [
  [0, 1, 1, 4],
  [1, 0, 2, 8],
  [0, -1, 4, 1],
  [-1, 0, 8, 2],
] as const;

/**
 * A maze that looks generated, for the skeleton: a depth-first maze of `size` from the start, the
 * `goals` cells open inside with exactly one entrance, as the rules ask. The same for one seed.
 */
export function decorativeMaze(size: number, goals: readonly number[], seed = 7): Uint8Array {
  let state = seed >>> 0;
  const draw = (count: number): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor((state / 4294967296) * count);
  };
  const walls = new Uint8Array(size * size).fill(15);
  const seen = new Uint8Array(size * size);
  const goal = new Set(goals);
  const open = (c: number, n: number, bit: number, back: number): void => {
    walls[c] = (walls[c] ?? 0) & ~bit;
    walls[n] = (walls[n] ?? 0) & ~back;
  };
  const around = (c: number) =>
    STEPS.flatMap(([dx, dy, bit, back]) => {
      const x = (c % size) + dx;
      const y = Math.floor(c / size) + dy;
      return x < 0 || y < 0 || x >= size || y >= size ? [] : [{ n: y * size + x, bit, back }];
    });

  for (const c of goals) {
    seen[c] = 1;
  }

  const stack = [0];
  seen[0] = 1;

  while (stack.length > 0) {
    const c = stack[stack.length - 1] ?? 0;
    const next = around(c).filter(({ n }) => seen[n] === 0);

    if (next.length === 0) {
      stack.pop();
      continue;
    }

    const step = next[draw(next.length)] ?? next[0];

    if (step !== undefined) {
      open(c, step.n, step.bit, step.back);
      seen[step.n] = 1;
      stack.push(step.n);
    }
  }

  const doors: [number, number, number, number][] = [];

  for (const c of goals) {
    for (const { n, bit, back } of around(c)) {
      if (goal.has(n)) {
        open(c, n, bit, back);
      } else {
        doors.push([c, n, bit, back]);
      }
    }
  }

  const door = doors[draw(doors.length)];

  if (door !== undefined) {
    open(...door);
  }

  return walls;
}

/** The passages open between two cells of `walls`. */
export function openPassages(walls: ArrayLike<number>, size: number): number {
  let open = 0;

  for (let c = 0; c < size * size; c++) {
    const w = walls[c] ?? 0;
    open += (c < size * (size - 1) && !(w & 1) ? 1 : 0) + (c % size < size - 1 && !(w & 2) ? 1 : 0);
  }

  return open;
}

/**
 * Whether a snapshot reads as a maze rather than a grid: at least half the `size² − 1` passages
 * of a spanning maze are open.
 */
export function looksLikeMaze(walls: ArrayLike<number>, size: number): boolean {
  return openPassages(walls, size) >= (size * size - 1) / 2;
}

/**
 * The track after a snapshot arrived at `now`: its routes tried join the trail, and its walls
 * replace the ones shown if they read as a maze; a restart that brings the grid back keeps the
 * last good walls.
 */
export function followTrack(
  track: LoadingTrack,
  snapshot: { readonly walls: Uint8Array; readonly tried: readonly { route: readonly number[] }[] },
  size: number,
  now: number
): LoadingTrack {
  return {
    started: true,
    walls: looksLikeMaze(snapshot.walls, size) ? snapshot.walls : track.walls,
    trail: [
      ...track.trail,
      ...snapshot.tried.map(({ route }) => ({ cells: route, at: now })),
    ].slice(-TRAIL),
  };
}

/** The shade of the wave on `line` at `time`: a band sweeping from the start corner to the far one. */
export function waveShade(line: LoadingLine, size: number, time: number, reduced: boolean): number {
  if (reduced) {
    return STILL_SHADE;
  }

  const at = ((time / WAVE_PERIOD) % 1.4) - 0.2;
  return 0.12 + 0.55 * Math.max(0, 1 - Math.abs((line[0] + line[1]) / (2 * size) - at) / 0.18);
}

/** The skeleton of a maze waiting its turn: `lines`, a decorative maze, under the wave. */
export function waveScene(
  lines: readonly LoadingLine[],
  size: number,
  time: number,
  reduced: boolean
): LoadingScene {
  return {
    size,
    lines: lines.map((line) => ({ line, shade: waveShade(line, size, time, reduced) })),
    routes: [],
  };
}

/**
 * What the board shows of a maze being built: the wave over `waiting` until a snapshot comes; then
 * the border and the routes being tried, the newest bold and the ones before thin and fading over
 * {@link ROUTE_FADE}; from the first snapshot that reads as a maze, the newest such. Without
 * motion, no routes.
 */
export function boardScene(
  track: LoadingTrack,
  waiting: readonly LoadingLine[],
  size: number,
  now: number,
  reduced: boolean
): LoadingScene {
  if (!track.started) {
    return waveScene(waiting, size, now, reduced);
  }

  if (track.walls !== null) {
    return {
      size,
      lines: wallLines(track.walls, size).map((line) => ({ line, shade: SNAPSHOT_SHADE })),
      routes: [],
    };
  }

  const shown = reduced ? [] : track.trail.filter(({ at }) => now - at < ROUTE_FADE);
  return {
    size,
    lines: borderLines(size).map((line) => ({ line, shade: SNAPSHOT_SHADE })),
    routes: shown.map(({ cells, at }, k) =>
      k === shown.length - 1
        ? { cells, alpha: 0.75, bold: true }
        : { cells, alpha: 0.25 * (1 - (now - at) / ROUTE_FADE), bold: false }
    ),
  };
}

const mix = (shade: number) =>
  `rgb(${GREY.map((c, k) => Math.round((FLOOR[k] ?? 0) + (c - (FLOOR[k] ?? 0)) * shade)).join(',')})`;

/**
 * Paints `scene` over the floor of `geometry`, whose units are device pixels. The posts sit on the
 * pixel grid, so walls across and along meet without a lump; walls of one shade are stroked as one
 * path in an opaque grey mixed over the floor, dimmest first, so a post never looks thicker.
 */
export function paintLoading(
  context: Canvas2D,
  geometry: BoardGeometry,
  scene: LoadingScene
): void {
  const width = Math.max(1, Math.round(geometry.wall));
  const snap = (v: number) => (width % 2 === 1 ? Math.floor(v) + 0.5 : Math.round(v));
  const point = (u: number, v: number) => toBoardPoint(geometry, { u, v });
  const shades = new Map<number, Path2D>();

  for (const { line, shade } of scene.lines) {
    const step = Math.round(Math.max(0, Math.min(1, shade)) * SHADE_STEPS);
    const path = shades.get(step) ?? new Path2D();
    const from = point(line[0], line[1]);
    const to = point(line[2], line[3]);
    path.moveTo(snap(from.x), snap(from.y));
    path.lineTo(snap(to.x), snap(to.y));
    shades.set(step, path);
  }

  context.globalAlpha = 1;
  context.fillStyle = TRACK_COLORS.floor;
  context.fillRect(0, 0, geometry.width, geometry.height);
  context.lineWidth = width;
  context.lineCap = 'square';
  context.lineJoin = 'miter';

  for (const [step, path] of [...shades].toSorted(([a], [b]) => a - b)) {
    context.strokeStyle = mix(step / SHADE_STEPS);
    context.stroke(path);
  }

  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = mix(1);
  const centre = (c: number) => point((c % scene.size) + 0.5, Math.floor(c / scene.size) + 0.5);

  for (const { cells, alpha, bold } of scene.routes) {
    if (cells.length < 2 || alpha <= 0) {
      continue;
    }

    const path = new Path2D();
    cells.forEach((c, k) => {
      const { x, y } = centre(c);

      if (k === 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    });
    context.globalAlpha = alpha;
    context.lineWidth = Math.max(bold ? 1.5 : 1, (bold ? 0.07 : 0.035) * geometry.pitch);
    context.stroke(path);
  }

  context.globalAlpha = 1;
}
