import { describe, expect, test } from 'vitest';

import { borderedMaze, setGoals, setStart, setWall, type Edge } from '@/maze';
import type { Recognition } from '@/photo';
import {
  brokenRules,
  edgeConfidence,
  jitterCorners,
  summarise,
  type ScoredFrame,
} from '@scripts/evaluation';

const truth2 = setStart(borderedMaze(2, 2), { x: 0, y: 0 });

describe('the rules a wrong edge breaks', () => {
  test('a post with no wall and the start open on two sides', () => {
    const edge: Edge = { direction: 'vertical', x: 1, y: 0 };
    const truth = setWall(truth2, edge, true);
    expect(brokenRules(truth2, truth)(edge)).toEqual(['lonePost', 'startOpen']);
    expect(brokenRules(truth, truth)(edge)).toEqual([]);
  });

  test('a cell the start cannot reach', () => {
    const found = setWall(
      setWall(truth2, { direction: 'horizontal', x: 1, y: 1 }, true),
      { direction: 'vertical', x: 1, y: 1 },
      true
    );
    expect(brokenRules(found, truth2)({ direction: 'vertical', x: 1, y: 1 })).toEqual([
      'unreachable',
    ]);
  });

  test('a wall between two goal cells', () => {
    const truth = setGoals(truth2, [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
    const edge: Edge = { direction: 'vertical', x: 1, y: 1 };
    expect(brokenRules(setWall(truth, edge, true), truth)(edge)).toContain('goalWall');
    expect(brokenRules(truth, truth)(edge)).not.toContain('goalWall');
  });
});

describe('the confidence of an edge', () => {
  test('reads the wall sets in their index order', () => {
    const recognition: Recognition = {
      maze: borderedMaze(2, 2),
      confidence: {
        horizontal: Float32Array.of(0, 1, 2, 3, 4, 5),
        vertical: Float32Array.of(10, 11, 12, 13, 14, 15),
      },
    };
    expect(edgeConfidence(recognition, { direction: 'horizontal', x: 1, y: 1 })).toBe(3);
    expect(edgeConfidence(recognition, { direction: 'vertical', x: 1, y: 1 })).toBe(14);
  });
});

describe('jittered corners', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ] as const;

  test('move by up to 1 % of the side, the same for the same seed', () => {
    const moved = jitterCorners(square, 3);
    expect(jitterCorners(square, 3)).toEqual(moved);
    expect(jitterCorners(square, 4)).not.toEqual(moved);
    moved.forEach((corner, index) => {
      expect(Math.abs(corner.x - square[index].x)).toBeLessThanOrEqual(1);
      expect(Math.abs(corner.y - square[index].y)).toBeLessThanOrEqual(1);
    });
  });
});

describe('a summary of frames', () => {
  const frames: ScoredFrame[] = [
    { event: 'a', score: 1, wrong: 0 },
    { event: 'a', score: 1, wrong: 0 },
    { event: 'b', score: 0.5, wrong: 4 },
    { event: 'c', score: 1, wrong: 0 },
  ];

  test('rates the frames with no wrong edge, with one event left out and over drawn events', () => {
    const summary = summarise(frames);
    expect(summary).toMatchObject({
      frames: 4,
      events: 3,
      zeroErrorRate: 0.75,
      meanScore: 0.875,
      wrongEdges: 4,
      leaveOneEventOut: [0.5, 1],
    });
    expect(summary.bootstrap90[0]).toBeLessThanOrEqual(0.75);
    expect(summary.bootstrap90[1]).toBe(1);
    expect(summarise(frames)).toEqual(summary);
  });

  test('has no event to leave out with one event', () => {
    expect(summarise(frames.slice(0, 2))).toMatchObject({
      zeroErrorRate: 1,
      leaveOneEventOut: null,
      bootstrap90: [1, 1],
    });
  });
});
