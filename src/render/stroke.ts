/**
 * The wall stroke (PLAN.md 3.4, DESIGN.md 10): a drag that paints or erases walls by walking the
 * grid of posts. The first edge touched decides the value and is always painted; the walk starts
 * at the end of that edge nearest the pointer and steps to a neighbouring post only when the
 * pointer is more than {@link STROKE_STEP} cells past the current post along one axis. So a stroke
 * turns at any post, tremor sideways never paints a perpendicular wall, a fast move walks every
 * post in between, and going back over the path never unpaints it.
 *
 * @module
 */

import { hasWall, paintWalls, type Edge, type Maze, type Post } from '@/maze';

import type { MazePoint } from './geometry';

/**
 * How far past the current post, in cells along one axis, the pointer must go to step on. It must
 * stay above half a cell: below that, a pointer between two posts would make the walk step back
 * and forth between them for ever.
 */
export const STROKE_STEP = 0.6;

/** The axis of a segment, named by the direction of its edges. */
export type StrokeAxis = Edge['direction'];

/** A stroke in progress. */
export interface Stroke {
  /** `true` paints walls, `false` erases them. */
  readonly value: boolean;
  /** The post the walk stands on. */
  readonly post: Post;
  /** The axis of the last segment walked, or of the first edge before any. */
  readonly axis: StrokeAxis;
  /** Every edge the stroke covers, each once, in the order first reached. */
  readonly edges: readonly Edge[];
}

/** Options of a step of the walk. */
export interface StrokeStepOptions {
  /** Walk only along the stroke's axis, as while Shift is held. */
  readonly lockAxis?: boolean;
}

function squaredDistance(point: MazePoint, post: Post): number {
  return (point.u - post.x) ** 2 + (point.v - post.y) ** 2;
}

function sameEdge(left: Edge, right: Edge): boolean {
  return left.direction === right.direction && left.x === right.x && left.y === right.y;
}

/**
 * Starts a stroke on `edge`, the first one the pointer touched at `point`: it erases when the edge
 * has a wall and paints otherwise.
 */
export function beginStroke(maze: Maze, edge: Edge, point: MazePoint): Stroke {
  const first: Post = { x: edge.x, y: edge.y };
  const second: Post =
    edge.direction === 'horizontal' ? { x: edge.x + 1, y: edge.y } : { x: edge.x, y: edge.y + 1 };
  return {
    value: !hasWall(maze, edge),
    post: squaredDistance(point, first) <= squaredDistance(point, second) ? first : second,
    axis: edge.direction,
    edges: [edge],
  };
}

function nextPost(
  maze: Pick<Maze, 'width' | 'height'>,
  post: Post,
  point: MazePoint,
  axes: readonly StrokeAxis[]
): Post | undefined {
  const along = (axis: StrokeAxis): number =>
    axis === 'horizontal' ? point.u - post.x : point.v - post.y;
  const inside = (candidate: Post): boolean =>
    candidate.x >= 0 && candidate.y >= 0 && candidate.x <= maze.width && candidate.y <= maze.height;

  return axes
    .filter((axis) => Math.abs(along(axis)) > STROKE_STEP)
    .toSorted((left, right) => Math.abs(along(right)) - Math.abs(along(left)))
    .map((axis) =>
      axis === 'horizontal'
        ? { x: post.x + Math.sign(along(axis)), y: post.y }
        : { x: post.x, y: post.y + Math.sign(along(axis)) }
    )
    .find(inside);
}

function segment(from: Post, to: Post): Edge {
  return from.y === to.y
    ? { direction: 'horizontal', x: Math.min(from.x, to.x), y: from.y }
    : { direction: 'vertical', x: from.x, y: Math.min(from.y, to.y) };
}

/**
 * Walks `stroke` toward `point` as far as the step rule allows, through every post in between.
 * Returns the same stroke when it does not move.
 */
export function extendStroke(
  maze: Pick<Maze, 'width' | 'height'>,
  stroke: Stroke,
  point: MazePoint,
  { lockAxis = false }: StrokeStepOptions = {}
): Stroke {
  const axes: readonly StrokeAxis[] = lockAxis ? [stroke.axis] : ['horizontal', 'vertical'];
  const edges = [...stroke.edges];
  let { post, axis } = stroke;
  let next = nextPost(maze, post, point, axes);

  if (next === undefined) {
    return stroke;
  }

  while (next !== undefined) {
    const edge = segment(post, next);

    if (!edges.some((known) => sameEdge(known, edge))) {
      edges.push(edge);
    }

    axis = edge.direction;
    post = next;
    next = nextPost(maze, post, point, axes);
  }

  return { ...stroke, post, axis, edges };
}

/** `maze` with the stroke painted on it, or the same maze when that changes nothing. */
export function applyStroke(maze: Maze, stroke: Stroke): Maze {
  return paintWalls(maze, stroke.edges, stroke.value);
}
