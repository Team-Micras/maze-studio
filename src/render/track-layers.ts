/**
 * The track of a maze as path data, one path per layer, in the order they are painted
 * (DESIGN.md 2.2): floor, rails, goal tint, start chevron, walls and posts. Walls and posts are
 * split by the paint rule of the real track: a cap that touches the start or a goal cell is left
 * bare (white) and every other one is red.
 *
 * @module
 */

import { cellIndex, hasWall, type Cell, type Edge, type Maze } from '@/maze';

import { cellRect, toBoardPoint, wallRect, type BoardGeometry, type BoardRect } from './geometry';
import { formatLength, rectPath } from './path';
import { TRACK_COLORS, TRACK_OPACITY } from './track-colors';

/** Path data of each layer of the track; an empty string draws nothing. */
export interface TrackLayers {
  /** The whole floor. */
  readonly floor: string;
  /** Every place a wall can go; empty in thumbnails. */
  readonly rails: string;
  /** The goal cells. */
  readonly goal: string;
  /** The start chevron, an open line to stroke, pointing north. */
  readonly start: string;
  /** Walls away from the start and the goals. */
  readonly redWalls: string;
  /** Walls touching the start or a goal. */
  readonly bareWalls: string;
  /** Posts away from the start and the goals. */
  readonly redPosts: string;
  /** Posts touching the start or a goal. */
  readonly barePosts: string;
}

const CHEVRON_HALF_WIDTH = 0.18;
const CHEVRON_RISE = 0.65;
const CHEVRON_DROP = 0.55;

function markedCells(maze: Maze): (x: number, y: number) => boolean {
  const marked = new Uint8Array(maze.width * maze.height);

  for (const cell of maze.start === undefined ? maze.goals : [maze.start, ...maze.goals]) {
    marked[cellIndex(maze.width, cell)] = 1;
  }

  return (x, y) =>
    x >= 0 && y >= 0 && x < maze.width && y < maze.height && marked[y * maze.width + x] === 1;
}

function railsPath(geometry: BoardGeometry): string {
  if (!geometry.rails) {
    return '';
  }

  const { columns, rows, pitch, wall } = geometry;
  const parts: string[] = [];

  for (let y = 0; y <= rows; y++) {
    const start = toBoardPoint(geometry, { u: 0, v: y });
    parts.push(
      rectPath({ x: start.x, y: start.y - wall / 2, width: columns * pitch, height: wall })
    );
  }

  for (let x = 0; x <= columns; x++) {
    const top = toBoardPoint(geometry, { u: x, v: rows });
    parts.push(rectPath({ x: top.x - wall / 2, y: top.y, width: wall, height: rows * pitch }));
  }

  return parts.join('');
}

function chevronPath(geometry: BoardGeometry, start: Cell | undefined): string {
  if (start === undefined) {
    return '';
  }

  const cell = cellRect(geometry, start);
  const centerX = cell.x + cell.width / 2;
  const centerY = cell.y + cell.height / 2;
  const half = geometry.pitch * CHEVRON_HALF_WIDTH;
  const left = { x: centerX - half, y: centerY + half * CHEVRON_DROP };
  const tip = { x: centerX, y: centerY - half * CHEVRON_RISE };
  const right = { x: centerX + half, y: centerY + half * CHEVRON_DROP };
  const f = formatLength;
  return `M${f(left.x)} ${f(left.y)}L${f(tip.x)} ${f(tip.y)}L${f(right.x)} ${f(right.y)}`;
}

function touchesMark(edge: Edge, marked: (x: number, y: number) => boolean): boolean {
  return edge.direction === 'horizontal'
    ? marked(edge.x, edge.y) || marked(edge.x, edge.y - 1)
    : marked(edge.x, edge.y) || marked(edge.x - 1, edge.y);
}

function edgeOn(direction: Edge['direction'], line: number, step: number): Edge {
  return direction === 'horizontal'
    ? { direction, x: step, y: line }
    : { direction, x: line, y: step };
}

function runRect(
  geometry: BoardGeometry,
  direction: Edge['direction'],
  line: number,
  from: number,
  length: number
): BoardRect {
  const span = length * geometry.pitch;

  if (direction === 'horizontal') {
    return { ...wallRect(geometry, edgeOn(direction, line, from)), width: span };
  }

  return { ...wallRect(geometry, edgeOn(direction, line, from + length - 1)), height: span };
}

/**
 * The walls of `maze` as runs, each the longest line of walls of one paint, so that a maze draws
 * with one rectangle per straight stretch of wall rather than one per edge.
 */
function wallRuns(
  maze: Maze,
  geometry: BoardGeometry,
  marked: (x: number, y: number) => boolean
): { readonly red: string[]; readonly bare: string[] } {
  const runs = { red: [] as string[], bare: [] as string[] };

  for (const direction of ['horizontal', 'vertical'] as const) {
    const lines = direction === 'horizontal' ? maze.height + 1 : maze.width + 1;
    const steps = direction === 'horizontal' ? maze.width : maze.height;

    for (let line = 0; line < lines; line++) {
      let from: number | undefined;
      let fromBare = false;
      const flush = (to: number): void => {
        if (from !== undefined) {
          (fromBare ? runs.bare : runs.red).push(
            rectPath(runRect(geometry, direction, line, from, to - from))
          );
          from = undefined;
        }
      };

      for (let step = 0; step < steps; step++) {
        const edge = edgeOn(direction, line, step);
        const walled = hasWall(maze, edge);
        const bare = walled && touchesMark(edge, marked);

        if (!walled || bare !== fromBare) {
          flush(step);
        }

        if (walled && from === undefined) {
          from = step;
          fromBare = bare;
        }
      }

      flush(steps);
    }
  }

  return runs;
}

/** The track of `maze` drawn with `geometry`. */
export function trackLayers(maze: Maze, geometry: BoardGeometry): TrackLayers {
  const marked = markedCells(maze);
  const walls = wallRuns(maze, geometry, marked);
  const redPosts: string[] = [];
  const barePosts: string[] = [];

  for (let y = 0; y <= maze.height; y++) {
    for (let x = 0; x <= maze.width; x++) {
      const center = toBoardPoint(geometry, { u: x, v: y });
      const square = rectPath({
        x: center.x - geometry.post / 2,
        y: center.y - geometry.post / 2,
        width: geometry.post,
        height: geometry.post,
      });
      const bare = marked(x, y) || marked(x - 1, y) || marked(x, y - 1) || marked(x - 1, y - 1);
      (bare ? barePosts : redPosts).push(square);
    }
  }

  return {
    floor: rectPath({ x: 0, y: 0, width: geometry.width, height: geometry.height }),
    rails: railsPath(geometry),
    goal: maze.goals.map((cell) => rectPath(cellRect(geometry, cell))).join(''),
    start: chevronPath(geometry, maze.start),
    redWalls: walls.red.join(''),
    bareWalls: walls.bare.join(''),
    redPosts: redPosts.join(''),
    barePosts: barePosts.join(''),
  };
}

/** One layer of the track as an SVG path paints it, with React's names for the attributes. */
export interface TrackPaint {
  readonly name: string;
  readonly d: string;
  readonly fill: string;
  readonly fillOpacity?: number;
  readonly stroke?: string;
  readonly strokeOpacity?: number;
  readonly strokeWidth?: number;
  readonly strokeLinecap?: 'round';
  readonly strokeLinejoin?: 'round';
}

/** The layers of the track of `maze` drawn with `geometry`, with their paint, in painting order. */
export function trackPaint(maze: Maze, geometry: BoardGeometry): readonly TrackPaint[] {
  const layers = trackLayers(maze, geometry);
  const postOutline = { stroke: TRACK_COLORS.floor, strokeWidth: geometry.postOutline };

  return [
    { name: 'floor', d: layers.floor, fill: TRACK_COLORS.floor },
    { name: 'rails', d: layers.rails, fill: TRACK_COLORS.rail },
    { name: 'goal', d: layers.goal, fill: TRACK_COLORS.goal, fillOpacity: TRACK_OPACITY.goal },
    {
      name: 'start',
      d: layers.start,
      fill: 'none',
      stroke: TRACK_COLORS.bare,
      strokeOpacity: TRACK_OPACITY.start,
      strokeWidth: geometry.startStroke,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    { name: 'red-walls', d: layers.redWalls, fill: TRACK_COLORS.wall },
    { name: 'bare-walls', d: layers.bareWalls, fill: TRACK_COLORS.bare },
    { name: 'red-posts', d: layers.redPosts, fill: TRACK_COLORS.post, ...postOutline },
    { name: 'bare-posts', d: layers.barePosts, fill: TRACK_COLORS.bare, ...postOutline },
  ];
}
