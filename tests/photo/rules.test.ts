import { describe, expect, test } from 'vitest';

import { borderedMaze, hasWall, setGoals, setStart, setWall, type Edge } from '@/maze';
import { brokenRules, repairLonePosts, type EdgeScores } from '@/photo';

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
    const { maze: repaired, walled } = repairLonePosts(
      maze,
      scores(4, (edge) =>
        edge.direction === best.direction && edge.x === best.x && edge.y === best.y ? 0.9 : 0.1
      )
    );
    expect(walled).toContainEqual(best);
    expect(hasWall(repaired, best)).toBe(true);
    expect(walled.every((edge) => hasWall(repaired, edge))).toBe(true);
    expect(brokenRules(repaired)(best)).not.toContain('lonePost');
    expect(walled).toHaveLength(8);
  });

  test('walls one edge for two lone posts that share it', () => {
    const maze = setWall(borderedMaze(3, 3), { direction: 'horizontal', x: 1, y: 2 }, true);
    const shared: Edge = { direction: 'horizontal', x: 1, y: 1 };
    const { walled } = repairLonePosts(
      maze,
      scores(3, (edge) =>
        edge.direction === shared.direction && edge.x === shared.x && edge.y === shared.y ? 1 : 0
      )
    );
    expect(walled[0]).toEqual(shared);
    expect(walled.filter((edge) => edge.x !== 0)).toEqual([shared]);
  });

  test('walls every open side of the start but its lowest-scoring one', () => {
    const { walled } = repairLonePosts(
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

  test('leaves a half-size maze as it is', () => {
    const maze = borderedMaze(32, 32);
    const { maze: repaired, walled } = repairLonePosts(
      maze,
      scores(32, () => 1)
    );
    expect(repaired).toBe(maze);
    expect(walled).toEqual([]);
  });
});
