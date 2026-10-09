import { describe, expect, test } from 'vitest';

import { createMaze, hasWall, setWall, type Edge, type Maze } from '@/maze';
import {
  applyStroke,
  beginStroke,
  extendStroke,
  nearestEdge,
  STROKE_STEP,
  type MazePoint,
  type Stroke,
} from '@/render';

const EMPTY = createMaze({ width: 16, height: 16 });

function name(edge: Edge): string {
  return `${edge.direction === 'horizontal' ? 'h' : 'v'}${edge.x},${edge.y}`;
}

function names(stroke: Stroke): string[] {
  return stroke.edges.map(name);
}

/** Points every `step` cells along straight lines through `corners`. */
function route(corners: readonly MazePoint[], step = 0.1): MazePoint[] {
  const points: MazePoint[] = [];

  for (let index = 1; index < corners.length; index++) {
    const from = corners[index - 1];
    const to = corners[index];

    if (from === undefined || to === undefined) {
      continue;
    }

    const count = Math.max(1, Math.ceil(Math.hypot(to.u - from.u, to.v - from.v) / step));

    for (let sample = index === 1 ? 0 : 1; sample <= count; sample++) {
      points.push({
        u: from.u + ((to.u - from.u) * sample) / count,
        v: from.v + ((to.v - from.v) * sample) / count,
      });
    }
  }

  return points;
}

/** A whole gesture: the first point picks the edge, every later one extends the stroke. */
function draw(
  maze: Maze,
  points: readonly MazePoint[],
  lock: (index: number) => boolean = () => false
): Stroke {
  const [first, ...rest] = points;
  const edge = first && nearestEdge(maze, first);

  if (first === undefined || edge === undefined) {
    throw new Error('the gesture starts away from every edge');
  }

  return rest.reduce(
    (stroke, point, index) => extendStroke(maze, stroke, point, { lockAxis: lock(index + 1) }),
    beginStroke(maze, edge, first)
  );
}

function ends(edge: Edge): string[] {
  return edge.direction === 'horizontal'
    ? [`${edge.x},${edge.y}`, `${edge.x + 1},${edge.y}`]
    : [`${edge.x},${edge.y}`, `${edge.x},${edge.y + 1}`];
}

function connected(stroke: Stroke): boolean {
  return stroke.edges.every((edge, index) => {
    const previous = stroke.edges[index - 1];
    return previous === undefined || ends(edge).some((post) => ends(previous).includes(post));
  });
}

describe('A stroke with turns', () => {
  test('draws an L in one gesture', () => {
    const stroke = draw(
      EMPTY,
      route([
        { u: 1.2, v: 2 },
        { u: 4, v: 2 },
        { u: 4, v: 5 },
      ])
    );

    expect(names(stroke)).toEqual(['h1,2', 'h2,2', 'h3,2', 'v4,2', 'v4,3', 'v4,4']);
    expect(connected(stroke)).toBe(true);
  });

  test('draws a U in one gesture', () => {
    const stroke = draw(
      EMPTY,
      route([
        { u: 2, v: 6.8 },
        { u: 2, v: 3 },
        { u: 5, v: 3 },
        { u: 5, v: 7 },
      ])
    );

    expect(names(stroke)).toEqual([
      'v2,6',
      'v2,5',
      'v2,4',
      'v2,3',
      'h2,3',
      'h3,3',
      'h4,3',
      'v5,3',
      'v5,4',
      'v5,5',
      'v5,6',
    ]);
  });

  test('draws a zigzag of single steps in one gesture', () => {
    const stroke = draw(
      EMPTY,
      route([
        { u: 0.2, v: 0 },
        { u: 1, v: 0 },
        { u: 1, v: 1 },
        { u: 2, v: 1 },
        { u: 2, v: 2 },
        { u: 3, v: 2 },
        { u: 3, v: 3 },
      ])
    );

    expect(names(stroke)).toEqual(['h0,0', 'v1,0', 'h1,1', 'v2,1', 'h2,2', 'v3,2']);
    expect(connected(stroke)).toBe(true);
  });
});

describe('A straight stroke with tremor', () => {
  test('paints no perpendicular wall with ±40 % of a cell sideways', () => {
    const shaky = route([
      { u: 1.2, v: 4 },
      { u: 9, v: 4 },
    ]).map((point, index) => ({
      u: point.u,
      v: index === 0 ? point.v : point.v + (index % 2 === 0 ? 0.4 : -0.4),
    }));
    const stroke = draw(EMPTY, shaky);

    expect(stroke.edges.every((edge) => edge.direction === 'horizontal' && edge.y === 4)).toBe(
      true
    );
    expect(names(stroke)).toEqual(['h1,4', 'h2,4', 'h3,4', 'h4,4', 'h5,4', 'h6,4', 'h7,4', 'h8,4']);
  });

  test('turns once the pointer is more than 0.6 cell past the post sideways', () => {
    const begun = beginStroke(EMPTY, { direction: 'horizontal', x: 3, y: 4 }, { u: 3.9, v: 4 });
    const within = extendStroke(EMPTY, begun, { u: 4, v: 4 + STROKE_STEP });
    const past = extendStroke(EMPTY, begun, { u: 4, v: 4 + STROKE_STEP + 0.01 });

    expect(within).toBe(begun);
    expect(names(past)).toEqual(['h3,4', 'v4,4']);
  });
});

describe('The step of the walk', () => {
  test('is more than half a cell, so the walk never steps back and forth', () => {
    expect(STROKE_STEP).toBeGreaterThan(0.5);
  });
});

describe('A fast stroke', () => {
  test('walks every post of a twelve-edge jump without a hole', () => {
    const stroke = draw(EMPTY, [
      { u: 0.2, v: 3 },
      { u: 12.2, v: 3 },
    ]);

    expect(names(stroke)).toEqual(Array.from({ length: 12 }, (_, x) => `h${x},3`));
  });

  test('walks a diagonal jump as a staircase of connected edges', () => {
    const stroke = draw(EMPTY, [
      { u: 0.2, v: 0 },
      { u: 5, v: 4 },
    ]);

    expect(stroke.post).toEqual({ x: 5, y: 4 });
    expect(stroke.edges).toHaveLength(9);
    expect(connected(stroke)).toBe(true);
  });

  test('stops at the border when the pointer leaves the maze', () => {
    const stroke = draw(EMPTY, [
      { u: 14.2, v: 16 },
      { u: 40, v: 16 },
    ]);

    expect(names(stroke)).toEqual(['h14,16', 'h15,16']);
    expect(stroke.post).toEqual({ x: 16, y: 16 });
  });
});

describe('A stroke going back', () => {
  test('keeps what it painted and adds no edge twice', () => {
    const stroke = draw(
      EMPTY,
      route([
        { u: 2.2, v: 5 },
        { u: 6, v: 5 },
        { u: 2, v: 5 },
      ])
    );

    expect(names(stroke)).toEqual(['h2,5', 'h3,5', 'h4,5', 'h5,5']);
    expect(stroke.post).toEqual({ x: 2, y: 5 });
  });
});

describe('A stroke with Shift', () => {
  test('stays on the axis of the last segment through the current post', () => {
    const points = route([
      { u: 1.2, v: 2 },
      { u: 4, v: 2 },
      { u: 7, v: 5 },
    ]);
    const turnAt = points.findIndex((point) => point.u > 4);
    const stroke = draw(EMPTY, points, (index) => index >= turnAt);

    expect(names(stroke)).toEqual(['h1,2', 'h2,2', 'h3,2', 'h4,2', 'h5,2', 'h6,2']);
  });

  test('stays on the axis of the first edge before any segment', () => {
    const stroke = draw(
      EMPTY,
      route([
        { u: 3, v: 3.2 },
        { u: 7, v: 3.4 },
        { u: 7, v: 6 },
      ]),
      () => true
    );

    expect(names(stroke)).toEqual(['v3,3', 'v3,4', 'v3,5']);
  });

  test('turns again once Shift is released', () => {
    const points = route([
      { u: 1.2, v: 2 },
      { u: 4, v: 2 },
      { u: 4, v: 4 },
    ]);
    const corner = points.findIndex((point) => point.v > 2);
    const locked = draw(EMPTY, points.slice(0, corner + 5), (index) => index >= corner);
    const released = points
      .slice(corner + 5)
      .reduce((stroke, point) => extendStroke(EMPTY, stroke, point), locked);

    expect(names(locked)).toEqual(['h1,2', 'h2,2', 'h3,2']);
    expect(names(released)).toEqual(['h1,2', 'h2,2', 'h3,2', 'v4,2', 'v4,3']);
  });
});

describe('The value of a stroke', () => {
  const walled = setWall(EMPTY, { direction: 'horizontal', x: 1, y: 2 }, true);

  test('erases when the first edge has a wall and paints when it has none', () => {
    const erasing = draw(
      walled,
      route([
        { u: 1.2, v: 2 },
        { u: 4, v: 2 },
      ])
    );
    const painting = draw(
      walled,
      route([
        { u: 5.2, v: 2 },
        { u: 2, v: 2 },
      ])
    );

    expect(erasing.value).toBe(false);
    expect(painting.value).toBe(true);
    expect(hasWall(applyStroke(walled, erasing), { direction: 'horizontal', x: 1, y: 2 })).toBe(
      false
    );
    const painted = applyStroke(walled, painting);
    expect(
      [0, 1, 2, 3, 4, 5, 6].map((x) => hasWall(painted, { direction: 'horizontal', x, y: 2 }))
    ).toEqual([false, true, true, true, true, true, false]);
  });

  test('starts at the end of the first edge nearest the pointer', () => {
    const east = beginStroke(EMPTY, { direction: 'horizontal', x: 1, y: 2 }, { u: 1.8, v: 2 });
    const south = beginStroke(EMPTY, { direction: 'vertical', x: 1, y: 2 }, { u: 1, v: 2.3 });

    expect(east.post).toEqual({ x: 2, y: 2 });
    expect(south.post).toEqual({ x: 1, y: 2 });
  });
});
