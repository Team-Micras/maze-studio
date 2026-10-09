/**
 * Where things are on a drawn maze. Two coordinate systems meet here: maze points, in cells, with
 * `u` growing east from the west border and `v` growing north from the south border; and board
 * points, in the units of the drawing, with `x` growing east and `y` growing south from its
 * top-left corner, a margin outside the grid so the border posts fit.
 *
 * @module
 */

import { isMazeEdge, type Cell, type Edge, type Maze } from '@/maze';

/** The longest side of a drawn maze, in world units, whatever its size (DESIGN.md 7). */
export const ARTBOARD_SIZE = 640;

/** How far from an edge, in cells, a pointer still picks it (DESIGN.md 10). */
export const EDGE_TOLERANCE = 0.32;

/** The full board, with rails and outlined posts, or the small thumbnail without them. */
export type TrackScale = 'board' | 'thumbnail';

interface TrackProportions {
  readonly wall: number;
  readonly post: number;
  readonly postOutline: number;
  readonly rails: boolean;
  readonly startStroke: number;
  readonly diffStroke: number;
}

const PROPORTIONS: Readonly<Record<TrackScale, TrackProportions>> = {
  board: {
    wall: 0.08,
    post: 0.13,
    postOutline: 0.022,
    rails: true,
    startStroke: 0.05,
    diffStroke: 0.04,
  },
  thumbnail: {
    wall: 0.14,
    post: 0.14,
    postOutline: 0,
    rails: false,
    startStroke: 0.09,
    diffStroke: 0.07,
  },
};

const MARGIN_GAP = 0.02;

/** A point of a maze in cells: `u` east from the west border, `v` north from the south border. */
export interface MazePoint {
  readonly u: number;
  readonly v: number;
}

/** A point of a drawn board: `x` east and `y` south from its top-left corner. */
export interface BoardPoint {
  readonly x: number;
  readonly y: number;
}

/** A rectangle of a drawn board. */
export interface BoardRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The measures of a maze drawn at a size; every length is in board units. */
export interface BoardGeometry {
  readonly scale: TrackScale;
  /** Cells from west to east. */
  readonly columns: number;
  /** Cells from south to north. */
  readonly rows: number;
  /** The distance between two posts, one cell. */
  readonly pitch: number;
  /** The thickness of a wall and of a rail. */
  readonly wall: number;
  /** The side of a post. */
  readonly post: number;
  /** The floor-coloured outline around a post, or 0 for none. */
  readonly postOutline: number;
  /** Whether the empty wall places are drawn. */
  readonly rails: boolean;
  /** The line width of the start chevron. */
  readonly startStroke: number;
  /** The line width of the diff outlines. */
  readonly diffStroke: number;
  /** The space between the edge of the drawing and the grid. */
  readonly margin: number;
  /** The width of the whole drawing. */
  readonly width: number;
  /** The height of the whole drawing. */
  readonly height: number;
}

/**
 * The geometry of `maze` drawn with its longest side, margins included, `size` units long.
 *
 * @param size The longest side of the drawing; {@link ARTBOARD_SIZE} by default.
 */
export function boardGeometry(
  maze: Pick<Maze, 'width' | 'height'>,
  { scale = 'board', size = ARTBOARD_SIZE }: { scale?: TrackScale; size?: number } = {}
): BoardGeometry {
  const proportions = PROPORTIONS[scale];
  const marginCells = proportions.post / 2 + MARGIN_GAP;
  const pitch = size / (Math.max(maze.width, maze.height) + 2 * marginCells);
  const margin = marginCells * pitch;

  return {
    scale,
    columns: maze.width,
    rows: maze.height,
    pitch,
    wall: proportions.wall * pitch,
    post: proportions.post * pitch,
    postOutline: proportions.postOutline * pitch,
    rails: proportions.rails,
    startStroke: proportions.startStroke * pitch,
    diffStroke: proportions.diffStroke * pitch,
    margin,
    width: maze.width * pitch + 2 * margin,
    height: maze.height * pitch + 2 * margin,
  };
}

/** The board point of a maze point. */
export function toBoardPoint(geometry: BoardGeometry, point: MazePoint): BoardPoint {
  return {
    x: geometry.margin + point.u * geometry.pitch,
    y: geometry.margin + (geometry.rows - point.v) * geometry.pitch,
  };
}

/** The maze point of a board point. */
export function toMazePoint(geometry: BoardGeometry, point: BoardPoint): MazePoint {
  return {
    u: (point.x - geometry.margin) / geometry.pitch,
    v: geometry.rows - (point.y - geometry.margin) / geometry.pitch,
  };
}

/** The square a cell covers on the board, from post centre to post centre. */
export function cellRect(geometry: BoardGeometry, cell: Cell): BoardRect {
  const corner = toBoardPoint(geometry, { u: cell.x, v: cell.y + 1 });
  return { x: corner.x, y: corner.y, width: geometry.pitch, height: geometry.pitch };
}

/** The place of a wall on `edge`, the full pitch long so that it runs under the posts. */
export function wallRect(geometry: BoardGeometry, edge: Edge): BoardRect {
  const { pitch, wall } = geometry;

  if (edge.direction === 'horizontal') {
    const start = toBoardPoint(geometry, { u: edge.x, v: edge.y });
    return { x: start.x, y: start.y - wall / 2, width: pitch, height: wall };
  }

  const top = toBoardPoint(geometry, { u: edge.x, v: edge.y + 1 });
  return { x: top.x - wall / 2, y: top.y, width: wall, height: pitch };
}

/** The part of a wall's place between its two posts, grown by `pad` on every side. */
export function slotRect(geometry: BoardGeometry, edge: Edge, pad = 0): BoardRect {
  const { pitch, wall, post } = geometry;
  const length = pitch - post;

  if (edge.direction === 'horizontal') {
    const start = toBoardPoint(geometry, { u: edge.x, v: edge.y });
    return {
      x: start.x + post / 2 - pad,
      y: start.y - wall / 2 - pad,
      width: length + 2 * pad,
      height: wall + 2 * pad,
    };
  }

  const top = toBoardPoint(geometry, { u: edge.x, v: edge.y + 1 });
  return {
    x: top.x - wall / 2 - pad,
    y: top.y + post / 2 - pad,
    width: wall + 2 * pad,
    height: length + 2 * pad,
  };
}

function nearestLine(value: number): number {
  return Math.round(value) || 0;
}

/**
 * The edge nearest to `point`, or `undefined` when none lies within `tolerance` cells of it.
 * Border edges count; edges outside the maze never do.
 */
export function nearestEdge(
  maze: Pick<Maze, 'width' | 'height'>,
  point: MazePoint,
  tolerance = EDGE_TOLERANCE
): Edge | undefined {
  const horizontal: Edge = {
    direction: 'horizontal',
    x: Math.floor(point.u),
    y: nearestLine(point.v),
  };
  const vertical: Edge = { direction: 'vertical', x: nearestLine(point.u), y: Math.floor(point.v) };
  const horizontalDistance = isMazeEdge(maze, horizontal)
    ? Math.abs(point.v - horizontal.y)
    : Infinity;
  const verticalDistance = isMazeEdge(maze, vertical) ? Math.abs(point.u - vertical.x) : Infinity;

  if (Math.min(horizontalDistance, verticalDistance) > tolerance) {
    return undefined;
  }

  return horizontalDistance <= verticalDistance ? horizontal : vertical;
}

/** The cell under `point`, or `undefined` outside the maze. */
export function cellAtPoint(
  maze: Pick<Maze, 'width' | 'height'>,
  point: MazePoint
): Cell | undefined {
  const x = Math.floor(point.u);
  const y = Math.floor(point.v);
  return x >= 0 && y >= 0 && x < maze.width && y < maze.height ? { x, y } : undefined;
}

function cellLine(value: number, last: number): number {
  return Math.min(Math.max(Math.floor(value), 0), last);
}

/** The cell under `point`, or the nearest cell of the maze when it is outside. */
export function nearestCell(maze: Pick<Maze, 'width' | 'height'>, point: MazePoint): Cell {
  return { x: cellLine(point.u, maze.width - 1), y: cellLine(point.v, maze.height - 1) };
}
