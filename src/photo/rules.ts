/**
 * The rules of a runnable maze that a recognition may break, and the repair of its lone posts.
 *
 * @module
 */

import {
  cellIndex,
  hasWall,
  loosePosts,
  openNeighbours,
  setWall,
  type Cell,
  type Edge,
  type Maze,
} from '@/maze';

import type { EdgeScores } from './classify';

/** A rule of a runnable maze that a maze breaks at an edge. */
export type BrokenRule = 'lonePost' | 'unreachable' | 'startOpen' | 'goalWall';

/** Cells a side from which a maze is half size, whose rules allow posts with no wall. */
export const HALF_SIZE = 32;

function reachable(maze: Maze, start: Cell): Set<number> {
  const seen = new Set([cellIndex(maze.width, start)]);
  const queue = [start];

  for (let cell = queue.pop(); cell !== undefined; cell = queue.pop()) {
    for (const next of openNeighbours(maze, cell)) {
      if (!seen.has(cellIndex(maze.width, next))) {
        seen.add(cellIndex(maze.width, next));
        queue.push(next);
      }
    }
  }

  return seen;
}

/**
 * The rules `maze` breaks at an edge, judged with its start (the south-west corner when it has
 * none) and goals: a post at either end with no wall, outside the middle of the goal, unless the
 * maze is half size; a cell on either side that the start cannot reach; the start, open on more
 * than one side, on either side; a wall between two goal cells.
 */
export function brokenRules(maze: Maze): (edge: Edge) => BrokenRule[] {
  const start = maze.start ?? { x: 0, y: 0 };
  const lone = new Set(
    maze.width >= HALF_SIZE ? [] : loosePosts(maze).map((post) => `${post.x},${post.y}`)
  );
  const seen = reachable(maze, start);
  const startOpen = openNeighbours(maze, start).length > 1;
  const goals = new Set(maze.goals.map((goal) => cellIndex(maze.width, goal)));

  return (edge) => {
    const sides: [Cell, Cell] =
      edge.direction === 'horizontal'
        ? [
            { x: edge.x, y: edge.y - 1 },
            { x: edge.x, y: edge.y },
          ]
        : [
            { x: edge.x - 1, y: edge.y },
            { x: edge.x, y: edge.y },
          ];
    const ends =
      edge.direction === 'horizontal'
        ? [`${edge.x},${edge.y}`, `${edge.x + 1},${edge.y}`]
        : [`${edge.x},${edge.y}`, `${edge.x},${edge.y + 1}`];
    const inside = sides.filter(
      (cell) => cell.x >= 0 && cell.y >= 0 && cell.x < maze.width && cell.y < maze.height
    );
    const broken: BrokenRule[] = [];

    if (ends.some((end) => lone.has(end))) {
      broken.push('lonePost');
    }

    if (inside.some((cell) => !seen.has(cellIndex(maze.width, cell)))) {
      broken.push('unreachable');
    }

    if (startOpen && inside.some((cell) => cell.x === start.x && cell.y === start.y)) {
      broken.push('startOpen');
    }

    if (
      hasWall(maze, edge) &&
      inside.length === 2 &&
      inside.every((cell) => goals.has(cellIndex(maze.width, cell)))
    ) {
      broken.push('goalWall');
    }

    return broken;
  };
}

/** The score of `edge` in `scores`, in the order of the maze's wall sets. */
function scoreOf(scores: EdgeScores, width: number, edge: Edge): number {
  return edge.direction === 'horizontal'
    ? scores.horizontal[edge.y * width + edge.x]
    : scores.vertical[edge.y * (width + 1) + edge.x];
}

/**
 * `maze` with a wall on the highest-scoring edge of each post that has none, outside the middle
 * of the goal, and the edges walled; a half-size maze, whose rules allow such posts, is returned
 * as it is.
 */
export function repairLonePosts(maze: Maze, scores: EdgeScores): { maze: Maze; walled: Edge[] } {
  if (maze.width >= HALF_SIZE) {
    return { maze, walled: [] };
  }

  let repaired = maze;
  const walled: Edge[] = [];

  for (const { x, y } of loosePosts(maze)) {
    const edges: Edge[] = [
      { direction: 'horizontal', x: x - 1, y },
      { direction: 'horizontal', x, y },
      { direction: 'vertical', x, y: y - 1 },
      { direction: 'vertical', x, y },
    ];
    const best = edges
      .filter((edge) => !Number.isNaN(scoreOf(scores, maze.width, edge)))
      .toSorted((a, b) => scoreOf(scores, maze.width, b) - scoreOf(scores, maze.width, a))[0];

    if (best !== undefined && edges.every((edge) => !hasWall(repaired, edge))) {
      repaired = setWall(repaired, best, true);
      walled.push(best);
    }
  }

  return { maze: repaired, walled };
}
