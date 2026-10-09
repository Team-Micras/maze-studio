/**
 * The track of a maze as path data, one path per layer, in the order they are painted
 * (DESIGN.md 2.2): floor, rails, goal tint, start chevron, walls and posts. Walls and posts are
 * split by the paint rule of the real track: a cap that touches the start or a goal cell is left
 * bare (white) and every other one is red.
 *
 * @module
 */

import { cellIndex, hasWall, type Cell, type Edge, type Maze } from '@/maze';

import { cellRect, toBoardPoint, wallRect, type BoardGeometry } from './geometry';
import { formatLength, rectPath } from './path';

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

function* walls(maze: Maze): Generator<Edge> {
  for (let y = 0; y <= maze.height; y++) {
    for (let x = 0; x < maze.width; x++) {
      const edge: Edge = { direction: 'horizontal', x, y };

      if (hasWall(maze, edge)) {
        yield edge;
      }
    }
  }

  for (let y = 0; y < maze.height; y++) {
    for (let x = 0; x <= maze.width; x++) {
      const edge: Edge = { direction: 'vertical', x, y };

      if (hasWall(maze, edge)) {
        yield edge;
      }
    }
  }
}

function touchesMark(edge: Edge, marked: (x: number, y: number) => boolean): boolean {
  return edge.direction === 'horizontal'
    ? marked(edge.x, edge.y) || marked(edge.x, edge.y - 1)
    : marked(edge.x, edge.y) || marked(edge.x - 1, edge.y);
}

/** The track of `maze` drawn with `geometry`. */
export function trackLayers(maze: Maze, geometry: BoardGeometry): TrackLayers {
  const marked = markedCells(maze);
  const redWalls: string[] = [];
  const bareWalls: string[] = [];
  const redPosts: string[] = [];
  const barePosts: string[] = [];

  for (const edge of walls(maze)) {
    (touchesMark(edge, marked) ? bareWalls : redWalls).push(rectPath(wallRect(geometry, edge)));
  }

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
    redWalls: redWalls.join(''),
    bareWalls: bareWalls.join(''),
    redPosts: redPosts.join(''),
    barePosts: barePosts.join(''),
  };
}
