import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import {
  borderedMaze,
  hasWall,
  loosePosts,
  parseMazeText,
  setGoals,
  setStart,
  setWall,
  type Edge,
  type Maze,
} from '@/maze';
import { brokenRules, repairClassic, type EdgeScores } from '@/photo';

const open2 = setStart(borderedMaze(2, 2), { x: 0, y: 0 });

function scores(size: number, score: (edge: Edge) => number): EdgeScores {
  return {
    horizontal: Float32Array.from({ length: (size + 1) * size }, (_, index) =>
      score({ direction: 'horizontal', x: index % size, y: Math.floor(index / size) })
    ),
    vertical: Float32Array.from({ length: size * (size + 1) }, (_, index) =>
      score({ direction: 'vertical', x: index % (size + 1), y: Math.floor(index / (size + 1)) })
    ),
  };
}

function mazeFile(file: string): Maze {
  const parsed = parseMazeText(
    readFileSync(join(import.meta.dirname, '..', '..', 'vendor', 'mazefiles', file), 'utf8'),
    file
  );

  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }

  return parsed.value.maze;
}

function pick(edge: Edge, direction: Edge['direction'], x: number, y: number): boolean {
  return edge.direction === direction && edge.x === x && edge.y === y;
}

describe('the rules a maze breaks at an edge', () => {
  test('a post with no wall and the start open on two sides', () => {
    const edge: Edge = { direction: 'vertical', x: 1, y: 0 };
    expect(brokenRules(open2)(edge)).toEqual(['lonePost', 'startOpen']);
    expect(brokenRules(setWall(open2, edge, true))(edge)).toEqual([]);
  });

  test('judges the start at the south-west corner when the maze has none', () => {
    expect(brokenRules(borderedMaze(2, 2))({ direction: 'vertical', x: 1, y: 0 })).toContain(
      'startOpen'
    );
  });

  test('a cell the start cannot reach', () => {
    const found = setWall(
      setWall(open2, { direction: 'horizontal', x: 1, y: 1 }, true),
      { direction: 'vertical', x: 1, y: 1 },
      true
    );
    expect(brokenRules(found)({ direction: 'vertical', x: 1, y: 1 })).toEqual(['unreachable']);
  });

  test('a wall between two goal cells', () => {
    const goals = setGoals(open2, [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
    const edge: Edge = { direction: 'vertical', x: 1, y: 1 };
    expect(brokenRules(setWall(goals, edge, true))(edge)).toContain('goalWall');
    expect(brokenRules(goals)(edge)).not.toContain('goalWall');
  });

  test('flags posts with no wall at every size', () => {
    const edge: Edge = { direction: 'vertical', x: 1, y: 5 };
    expect(brokenRules(borderedMaze(32, 32))(edge)).toContain('lonePost');
    expect(brokenRules(borderedMaze(16, 16))(edge)).toContain('lonePost');
  });

  test('flags only the open sides of a start open on more than one side', () => {
    const maze = setWall(borderedMaze(3, 3), { direction: 'horizontal', x: 1, y: 1 }, true);
    expect(brokenRules(maze)({ direction: 'vertical', x: 1, y: 0 })).toContain('startOpen');
    expect(brokenRules(maze)({ direction: 'horizontal', x: 0, y: 0 })).not.toContain('startOpen');
  });
});

describe('the repair of a classic maze', () => {
  test('walls the highest-scoring edge of each lone post, outside the middle of the goal', () => {
    const maze = setGoals(borderedMaze(4, 4), [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
    ]);
    const best: Edge = { direction: 'vertical', x: 1, y: 0 };
    const { maze: repaired, walled } = repairClassic(
      maze,
      scores(4, (edge) =>
        pick(edge, best.direction, best.x, best.y)
          ? 9
          : (edge.x * 5 + edge.y + (edge.direction === 'vertical' ? 25 : 0)) / 5
      )
    );
    expect(walled).toContainEqual(best);
    expect(hasWall(repaired, best)).toBe(true);
    expect(walled.every((edge) => hasWall(repaired, edge))).toBe(true);
    expect(brokenRules(repaired)(best)).not.toContain('lonePost');
    expect(loosePosts(repaired)).toEqual([]);
  });

  test('walls one edge for two lone posts that share it', () => {
    const maze = setWall(borderedMaze(3, 3), { direction: 'horizontal', x: 1, y: 2 }, true);
    const shared: Edge = { direction: 'horizontal', x: 1, y: 1 };
    const { walled } = repairClassic(
      maze,
      scores(3, (edge) =>
        edge.direction === shared.direction && edge.x === shared.x && edge.y === shared.y ? 1 : 0
      )
    );
    expect(walled[0]).toEqual(shared);
    expect(walled.filter((edge) => edge.x !== 0)).toEqual([shared]);
  });

  test('walls every open side of the start but its lowest-scoring one', () => {
    const { walled } = repairClassic(
      borderedMaze(2, 2),
      scores(2, (edge) =>
        pick(edge, 'horizontal', 1, 1)
          ? 0.9
          : pick(edge, 'horizontal', 0, 1)
            ? 0.3
            : pick(edge, 'vertical', 1, 0)
              ? 0.2
              : 0.1
      )
    );
    expect(walled).toEqual([
      { direction: 'horizontal', x: 1, y: 1 },
      { direction: 'horizontal', x: 0, y: 1 },
    ]);
  });

  test('keeps a measured side of the start open, not one off the photo', () => {
    const { walled } = repairClassic(
      borderedMaze(2, 2),
      scores(2, (edge) =>
        pick(edge, 'horizontal', 0, 1) ? Number.NaN : pick(edge, 'horizontal', 1, 1) ? 0.9 : 0.1
      )
    );
    expect(walled).toContainEqual({ direction: 'horizontal', x: 0, y: 1 });
    expect(walled).not.toContainEqual({ direction: 'vertical', x: 1, y: 0 });
  });

  test('leaves the lone posts of an open area, whose edges all score alike', () => {
    const maze = mazeFile('classic/japan2.txt');
    const { maze: repaired, walled } = repairClassic(
      maze,
      scores(16, (edge) => (hasWall(maze, edge) ? 1 : -0.2 + ((edge.x * 7 + edge.y * 3) % 5) / 100))
    );
    expect(loosePosts(maze).length).toBeGreaterThan(0);
    expect(walled).toEqual([]);
    expect(repaired).toBe(maze);
  });

  test('walls a lone post whose best edge stands out, among lone posts that do not', () => {
    const truth = mazeFile('classic/japan2.txt');
    const missed: Edge = { direction: 'horizontal', x: 6, y: 4 };
    const maze = setWall(truth, missed, false);
    const { walled } = repairClassic(
      maze,
      scores(16, (edge) =>
        hasWall(maze, edge) ? 1 : pick(edge, missed.direction, missed.x, missed.y) ? -0.3 : -1
      )
    );
    expect(hasWall(truth, missed)).toBe(true);
    expect(walled).toEqual([missed]);
  });

  test('leaves a lone post whose best edge stands out but lies far below the threshold', () => {
    const truth = mazeFile('classic/japan2.txt');
    const missed: Edge = { direction: 'horizontal', x: 6, y: 4 };
    const maze = setWall(truth, missed, false);
    const { walled } = repairClassic(
      maze,
      scores(16, (edge) =>
        hasWall(maze, edge) ? 1 : pick(edge, missed.direction, missed.x, missed.y) ? -0.8 : -1.6
      )
    );
    expect(walled).toEqual([]);
  });

  test('leaves a half-size maze as it is', () => {
    const maze = borderedMaze(32, 32);
    const { maze: repaired, walled } = repairClassic(
      maze,
      scores(32, () => 1)
    );
    expect(repaired).toBe(maze);
    expect(walled).toEqual([]);
  });
});
