/**
 * The proof rules: checks that a maze can be run, beyond the repository's format rules.
 *
 * - A loose post is one where none of the up to 4 edges that meet at it has a wall; posts whose 4
 *   neighbouring cells are all goal cells, the middle of a goal area, are exempt.
 * - An entrance of the goal is an open edge inside the grid between a goal cell and a cell that
 *   is not one.
 * - Reachability is only judged when the maze has a start and goals.
 *
 * @module
 */

import { hasWall, type Edge } from './edges';
import { cellIndex, type Cell, type Maze } from './maze';
import type { Post, Problem } from './validation-types';

function goalIndices(maze: Maze): Set<number> {
  return new Set(maze.goals.map((goal) => cellIndex(maze.width, goal)));
}

function isGoal(maze: Maze, goals: ReadonlySet<number>, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < maze.width && y < maze.height && goals.has(y * maze.width + x);
}

function edgesAtPost(maze: Maze, post: Post): Edge[] {
  const edges: Edge[] = [];

  if (post.x > 0) {
    edges.push({ direction: 'horizontal', x: post.x - 1, y: post.y });
  }

  if (post.x < maze.width) {
    edges.push({ direction: 'horizontal', x: post.x, y: post.y });
  }

  if (post.y > 0) {
    edges.push({ direction: 'vertical', x: post.x, y: post.y - 1 });
  }

  if (post.y < maze.height) {
    edges.push({ direction: 'vertical', x: post.x, y: post.y });
  }

  return edges;
}

function inGoalMiddle(maze: Maze, goals: ReadonlySet<number>, post: Post): boolean {
  return [
    [post.x - 1, post.y - 1],
    [post.x, post.y - 1],
    [post.x - 1, post.y],
    [post.x, post.y],
  ].every(([x = -1, y = -1]) => isGoal(maze, goals, x, y));
}

/** The posts no wall touches, outside the middle of the goal area. */
export function loosePosts(maze: Maze): Post[] {
  const goals = goalIndices(maze);
  const loose: Post[] = [];

  for (let y = 0; y <= maze.height; y++) {
    for (let x = 0; x <= maze.width; x++) {
      const post = { x, y };

      if (
        !inGoalMiddle(maze, goals, post) &&
        edgesAtPost(maze, post).every((edge) => !hasWall(maze, edge))
      ) {
        loose.push(post);
      }
    }
  }

  return loose;
}

/** The cells next to `cell` with no wall between them. */
export function openNeighbours(maze: Maze, cell: Cell): Cell[] {
  const { x, y } = cell;
  const steps: [Cell, Edge][] = [
    [
      { x, y: y + 1 },
      { direction: 'horizontal', x, y: y + 1 },
    ],
    [
      { x, y: y - 1 },
      { direction: 'horizontal', x, y },
    ],
    [
      { x: x + 1, y },
      { direction: 'vertical', x: x + 1, y },
    ],
    [
      { x: x - 1, y },
      { direction: 'vertical', x, y },
    ],
  ];

  return steps
    .filter(
      ([next, edge]) =>
        next.x >= 0 &&
        next.y >= 0 &&
        next.x < maze.width &&
        next.y < maze.height &&
        !hasWall(maze, edge)
    )
    .map(([next]) => next);
}

/** Whether a goal can be reached from the start through open edges. */
export function reachesGoal(maze: Maze, start: Cell): boolean {
  const goals = goalIndices(maze);
  const seen = new Set([cellIndex(maze.width, start)]);
  const queue = [start];

  for (let cell = queue.shift(); cell !== undefined; cell = queue.shift()) {
    if (goals.has(cellIndex(maze.width, cell))) {
      return true;
    }

    for (const next of openNeighbours(maze, cell)) {
      const index = cellIndex(maze.width, next);

      if (!seen.has(index)) {
        seen.add(index);
        queue.push(next);
      }
    }
  }

  return false;
}

/** The open edges inside the grid between a goal cell and a cell that is not one. */
export function goalEntrances(maze: Maze): Edge[] {
  const goals = goalIndices(maze);
  const entrances: Edge[] = [];

  for (const goal of maze.goals) {
    const { x, y } = goal;
    const sides: [number, number, Edge][] = [
      [x, y + 1, { direction: 'horizontal', x, y: y + 1 }],
      [x, y - 1, { direction: 'horizontal', x, y }],
      [x + 1, y, { direction: 'vertical', x: x + 1, y }],
      [x - 1, y, { direction: 'vertical', x, y }],
    ];

    for (const [nextX, nextY, edge] of sides) {
      const inside = nextX >= 0 && nextY >= 0 && nextX < maze.width && nextY < maze.height;

      if (inside && !isGoal(maze, goals, nextX, nextY) && !hasWall(maze, edge)) {
        entrances.push(edge);
      }
    }
  }

  return entrances;
}

/** The loose posts, as one problem. */
export function loosePostProblems(maze: Maze): Problem[] {
  const posts = loosePosts(maze);
  return posts.length === 0
    ? []
    : [
        {
          message: `${posts.length} post${posts.length === 1 ? '' : 's'} with no wall: a mouse cannot tell where it is there`,
          cells: [],
          edges: [],
          posts,
        },
      ];
}

/** A start from which no goal can be reached, as one problem; nothing without a start and goals. */
export function goalReachableProblems(maze: Maze): Problem[] {
  const { start } = maze;

  if (start === undefined || maze.goals.length === 0 || reachesGoal(maze, start)) {
    return [];
  }

  return [
    {
      message: 'no goal can be reached from the start',
      cells: [start, ...maze.goals],
      edges: [],
      posts: [],
    },
  ];
}

/** A goal area with no entrance or more than one, as one problem; nothing without goals. */
export function goalEntranceProblems(maze: Maze): Problem[] {
  const entrances = goalEntrances(maze);

  if (maze.goals.length === 0 || entrances.length === 1) {
    return [];
  }

  return [
    {
      message:
        entrances.length === 0
          ? 'the goal area has no entrance'
          : `the goal area has ${entrances.length} entrances, not one`,
      cells: maze.goals,
      edges: entrances,
      posts: [],
    },
  ];
}
