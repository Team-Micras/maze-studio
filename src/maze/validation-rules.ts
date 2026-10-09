/**
 * What each rule checks, profile aside: the rules about the file, which read the document's
 * `source`, and the rules about the maze.
 *
 * @module
 */

import { hasWall, type Edge } from './edges';
import { goalEntranceProblems, goalReachableProblems, loosePostProblems } from './maze-proofs';
import { cellIndex, type Cell, type Maze } from './maze';
import type { Irregularity, IrregularityKind, MazeTextSource } from './maze-text';
import { placeOfText } from './text-position';
import { START_MARK } from './text-layout';
import type { Problem, Rule, ValidationInput } from './validation-types';

const CLASSIC_SIDE = 16;
const CLASSIC_GOAL_CORNER = 7;
const FILE_STEM = /^[A-Za-z0-9-]*$/;
const GRID_IRREGULARITIES: ReadonlySet<IrregularityKind> = new Set([
  'wall',
  'cell',
  'short-line',
  'ragged-line',
]);

function problem(message: string, where: Partial<Omit<Problem, 'message'>> = {}): Problem {
  return { message, cells: where.cells ?? [], edges: where.edges ?? [], posts: where.posts ?? [] };
}

function fromSource(
  check: (source: MazeTextSource, maze: Maze) => Problem[]
): (input: ValidationInput) => Problem[] {
  return ({ source, maze }) => (source === undefined ? [] : check(source, maze));
}

function pointAt(maze: Maze, irregularity: Irregularity): Partial<Omit<Problem, 'message'>> {
  const { cell, edge } = placeOfText(maze, irregularity.line, irregularity.column);
  return { cells: cell === undefined ? [] : [cell], edges: edge === undefined ? [] : [edge] };
}

function fileNameProblems(source: MazeTextSource): Problem[] {
  const name = source.fileName.split('/').at(-1) ?? '';
  const stem = name.slice(0, -'.txt'.length);
  return name.endsWith('.txt') && FILE_STEM.test(stem)
    ? []
    : [problem(`"${name}" is not a .txt name of letters, digits and "-" only`)];
}

function gridProblems(source: MazeTextSource, maze: Maze): Problem[] {
  return source.irregularities
    .filter((irregularity) => GRID_IRREGULARITIES.has(irregularity.kind))
    .map((irregularity) =>
      problem(
        `line ${irregularity.line}, column ${irregularity.column}: ${describe(irregularity)}`,
        pointAt(maze, irregularity)
      )
    );
}

function describe(irregularity: Irregularity): string {
  switch (irregularity.kind) {
    case 'wall':
      return `"${irregularity.found}" is not a wall or an opening`;
    case 'cell':
      return `"${irregularity.found}" is not a cell mark`;
    case 'short-line':
      return 'the line is shorter than the grid';
    default:
      return 'the line after the grid looks like more of it';
  }
}

function trailerProblems(source: MazeTextSource): Problem[] {
  return source.irregularities
    .filter((irregularity) => irregularity.kind === 'long-trailer')
    .map((irregularity) =>
      problem(`the text after the maze has ${irregularity.found}, too long to share in a link`)
    );
}

function classicSizeProblems(maze: Maze): Problem[] {
  return maze.width === CLASSIC_SIDE && maze.height === CLASSIC_SIDE
    ? []
    : [problem(`the maze is ${maze.width}×${maze.height}, not 16×16`)];
}

function openBorder(maze: Maze): Edge[] {
  const edges: Edge[] = [];

  for (let x = 0; x < maze.width; x++) {
    edges.push(
      { direction: 'horizontal', x, y: 0 },
      { direction: 'horizontal', x, y: maze.height }
    );
  }

  for (let y = 0; y < maze.height; y++) {
    edges.push({ direction: 'vertical', x: 0, y }, { direction: 'vertical', x: maze.width, y });
  }

  return edges.filter((edge) => !hasWall(maze, edge));
}

function closedBorderProblems(maze: Maze): Problem[] {
  const open = openBorder(maze);
  return open.length === 0
    ? []
    : [
        problem(`the border has ${open.length} opening${open.length === 1 ? '' : 's'}`, {
          edges: open,
        }),
      ];
}

function countStartMarks(text: string): number {
  return text.split(START_MARK).length - 1;
}

function startMarks(irregularity: Irregularity): number {
  switch (irregularity.kind) {
    case 'extra-start':
      return 1;
    case 'cell':
      return countStartMarks(irregularity.found.charAt(0) + irregularity.found.charAt(2));
    case 'wall':
      return countStartMarks(irregularity.found);
    default:
      return 0;
  }
}

function cellNear(maze: Maze, irregularity: Irregularity): Cell | undefined {
  const { cell, edge } = placeOfText(maze, irregularity.line, irregularity.column);

  if (edge === undefined) {
    return cell;
  }

  return {
    x: Math.min(edge.x, maze.width - 1),
    y: Math.min(edge.y, maze.height - 1),
  };
}

function extraStarts(source: MazeTextSource | undefined, maze: Maze): Cell[] {
  return (source?.irregularities ?? []).flatMap((irregularity) => {
    const cell = cellNear(maze, irregularity);
    return cell === undefined ? [] : Array.from({ length: startMarks(irregularity) }, () => cell);
  });
}

function singleStartProblems({ maze, source }: ValidationInput): Problem[] {
  const others = extraStarts(source, maze);
  const count = (maze.start === undefined ? 0 : 1) + others.length;
  return count <= 1
    ? []
    : [
        problem(`the grid has ${count} "S" marks; a maze has one start`, {
          cells: [...(maze.start === undefined ? [] : [maze.start]), ...others],
        }),
      ];
}

function startCornerProblems(maze: Maze): Problem[] {
  const corner = { x: 0, y: 0 };
  const { start } = maze;

  if (start === undefined || start.x !== 0 || start.y !== 0) {
    return [
      problem(
        start === undefined ? 'the maze has no start' : 'the start is not the south-west corner',
        {
          cells: start === undefined ? [corner] : [start, corner],
        }
      ),
    ];
  }

  const closed: Edge[] = [
    { direction: 'vertical', x: 0, y: 0 },
    { direction: 'vertical', x: 1, y: 0 },
    { direction: 'horizontal', x: 0, y: 0 },
  ];
  const north: Edge = { direction: 'horizontal', x: 0, y: 1 };
  const wrong = [
    ...closed.filter((edge) => !hasWall(maze, edge)),
    ...(maze.height > 1 && hasWall(maze, north) ? [north] : []),
  ];

  return wrong.length === 0
    ? []
    : [
        problem('the start cell must be walled west, east and south, and open north', {
          cells: [corner],
          edges: wrong,
        }),
      ];
}

function goalAreaProblems(maze: Maze): Problem[] {
  if (maze.goals.length === 0) {
    return [problem('the maze has no goal')];
  }

  const xs = maze.goals.map((goal) => goal.x);
  const ys = maze.goals.map((goal) => goal.y);
  const [west, east, south, north] = [
    Math.min(...xs),
    Math.max(...xs),
    Math.min(...ys),
    Math.max(...ys),
  ];
  const goals = new Set(maze.goals.map((goal) => cellIndex(maze.width, goal)));
  const missing: Cell[] = [];
  const inner: Edge[] = [];

  for (let y = south; y <= north; y++) {
    for (let x = west; x <= east; x++) {
      if (!goals.has(cellIndex(maze.width, { x, y }))) {
        missing.push({ x, y });
      }

      if (y > south && hasWall(maze, { direction: 'horizontal', x, y })) {
        inner.push({ direction: 'horizontal', x, y });
      }

      if (x > west && hasWall(maze, { direction: 'vertical', x, y })) {
        inner.push({ direction: 'vertical', x, y });
      }
    }
  }

  return [
    ...(missing.length === 0
      ? []
      : [problem('the goal cells do not form a rectangle', { cells: missing })]),
    ...(inner.length === 0
      ? []
      : [problem('the goal area has walls inside', { cells: maze.goals, edges: inner })]),
  ];
}

function classicGoalProblems(maze: Maze): Problem[] {
  const expected: Cell[] = [0, 1, 2, 3].map((index) => ({
    x: CLASSIC_GOAL_CORNER + (index % 2),
    y: CLASSIC_GOAL_CORNER + Math.floor(index / 2),
  }));
  const matches =
    maze.goals.length === expected.length &&
    expected.every((cell) => maze.goals.some((goal) => goal.x === cell.x && goal.y === cell.y));

  return matches
    ? []
    : [problem('the goal of a classic maze is the 4 cells (7, 7) to (8, 8)', { cells: expected })];
}

/** The check of each rule, which finds its problems whatever the profile. */
export const MAZE_RULE_CHECKS: Readonly<Record<Rule, (input: ValidationInput) => Problem[]>> = {
  'file-name': fromSource(fileNameProblems),
  'classic-size': ({ maze }) => classicSizeProblems(maze),
  'homogeneous-grid': fromSource(gridProblems),
  'no-carriage-return': fromSource((source) =>
    source.hadCR
      ? [problem('the file has carriage returns; the repository uses line feeds only')]
      : []
  ),
  'final-newline': fromSource((source) =>
    source.hadFinalNewline ? [] : [problem('the file does not end with a line feed')]
  ),
  'trailer-size': fromSource(trailerProblems),
  'closed-border': ({ maze }) => closedBorderProblems(maze),
  'single-start': singleStartProblems,
  'start-corner': ({ maze }) => startCornerProblems(maze),
  'goal-area': ({ maze }) => goalAreaProblems(maze),
  'classic-goal': ({ maze }) => classicGoalProblems(maze),
  'loose-post': ({ maze }) => loosePostProblems(maze),
  'goal-reachable': ({ maze }) => goalReachableProblems(maze),
  'single-goal-entrance': ({ maze }) => goalEntranceProblems(maze),
};
