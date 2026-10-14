import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import {
  createMaze,
  diffMazes,
  parseMazeText,
  setGoals,
  setStart,
  setWall,
  type Cell,
  type Maze,
  type MazeDiff,
} from '@/maze';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'diff');

interface Expected {
  readonly added: number;
  readonly removed: number;
  readonly goalsAdded: number;
  readonly goalsRemoved: number;
  readonly startBefore: readonly [number, number] | null;
  readonly startAfter: readonly [number, number] | null;
}

function read(name: string, file: string): Maze {
  const parsed = parseMazeText(readFileSync(join(FIXTURES, name, file), 'utf8'), file);

  if (!parsed.ok) {
    throw new Error(`${name}/${file} does not parse`);
  }

  return parsed.value.maze;
}

function cell(pair: readonly [number, number] | null): Cell | undefined {
  return pair === null ? undefined : { x: pair[0], y: pair[1] };
}

function counts(diff: MazeDiff | undefined) {
  return diff === undefined
    ? null
    : {
        added: diff.added.length,
        removed: diff.removed.length,
        goalsAdded: diff.goalsAdded.length,
        goalsRemoved: diff.goalsRemoved.length,
        startBefore: diff.startBefore,
        startAfter: diff.startAfter,
      };
}

function expectedCounts(expected: Expected | null) {
  return expected === null
    ? null
    : {
        ...expected,
        startBefore: cell(expected.startBefore),
        startAfter: cell(expected.startAfter),
      };
}

const CASES = readdirSync(FIXTURES).toSorted();

describe('diffMazes over the fixture pairs', () => {
  test('finds every fixture', () => {
    expect(CASES).toEqual([
      'different-sizes',
      'start-moved-five-walls-removed',
      'three-walls-added-one-removed-goal-grown',
      'twelve-walls-added-marks-cleared',
      'unchanged',
    ]);
  });

  test.each(CASES)('%s has the counts written next to it', (name) => {
    const expected: Expected | null = JSON.parse(
      readFileSync(join(FIXTURES, name, 'expected.json'), 'utf8')
    );
    const diff = diffMazes(read(name, 'before.txt'), read(name, 'after.txt'));

    expect(counts(diff)).toEqual(expectedCounts(expected));
  });
});

describe('diffMazes', () => {
  const empty = createMaze({ width: 3, height: 2 });

  test('names the edges put and taken, east–west ones first', () => {
    const before = setWall(empty, { direction: 'vertical', x: 1, y: 0 }, true);
    const after = setWall(
      setWall(empty, { direction: 'horizontal', x: 2, y: 1 }, true),
      { direction: 'vertical', x: 3, y: 1 },
      true
    );

    expect(diffMazes(before, after)).toEqual({
      added: [
        { direction: 'horizontal', x: 2, y: 1 },
        { direction: 'vertical', x: 3, y: 1 },
      ],
      removed: [{ direction: 'vertical', x: 1, y: 0 }],
      goalsAdded: [],
      goalsRemoved: [],
      startBefore: undefined,
      startAfter: undefined,
    });
  });

  test('names the goal cells marked and unmarked and the start on both sides', () => {
    const before = setStart(
      setGoals(empty, [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
      ]),
      { x: 0, y: 0 }
    );
    const after = setStart(
      setGoals(empty, [
        { x: 2, y: 1 },
        { x: 2, y: 0 },
      ]),
      { x: 1, y: 0 }
    );
    const diff = diffMazes(before, after);

    expect(diff?.goalsAdded).toEqual([{ x: 2, y: 0 }]);
    expect(diff?.goalsRemoved).toEqual([{ x: 1, y: 1 }]);
    expect(diff?.startBefore).toEqual({ x: 0, y: 0 });
    expect(diff?.startAfter).toEqual({ x: 1, y: 0 });
  });

  test('has no diff between mazes of different sizes, even with the same area', () => {
    expect(diffMazes(empty, createMaze({ width: 2, height: 3 }))).toBeUndefined();
  });
});
