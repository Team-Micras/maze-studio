import { describe, expect, test } from 'vitest';

import {
  fitHomography,
  lensOf,
  lightness,
  normaliseLocally,
  otsuThreshold,
  rectify,
  scoreEdges,
  topHat,
  type EdgeScores,
  type Plane,
} from '@/photo';
import { drawBoard } from '@tests/support/photo/draw-board';
import { randomMaze } from '@tests/support/photo/random-maze';

function wall(index: number): boolean {
  return index % 3 === 0;
}

function split(values: Float32Array): boolean[] {
  const threshold = otsuThreshold(values);
  return Array.from(values, (value) => value > threshold);
}

const SIZE = 6;
const SCALE = 24;
const SIDE = SIZE * SCALE;
const TOP_THICKNESS = 2;
const FLOOR = 0.1;

interface Edge {
  readonly horizontal: boolean;
  readonly line: number;
  readonly segment: number;
}

const EDGES: readonly Edge[] = [
  ...Array.from({ length: (SIZE + 1) * SIZE }, (_, index) => ({
    horizontal: true,
    line: SIZE - Math.floor(index / SIZE),
    segment: index % SIZE,
  })),
  ...Array.from({ length: SIZE * (SIZE + 1) }, (_, index) => ({
    horizontal: false,
    line: index % (SIZE + 1),
    segment: SIZE - 1 - Math.floor(index / (SIZE + 1)),
  })),
];

function isBorder(edge: Edge): boolean {
  return edge.line === 0 || edge.line === SIZE;
}

type Layout = (edge: Edge) => boolean;

function patterned(edge: Edge): boolean {
  return (
    isBorder(edge) || (edge.line * 7 + edge.segment * 13 + (edge.horizontal ? 0 : 1)) % 3 !== 0
  );
}

function nearerWalls(edge: Edge): boolean {
  return isBorder(edge) || (edge.horizontal && patterned(edge));
}

function glare(x: number): number {
  return FLOOR + 0.45 * (1 - x / SIDE);
}

function fill(
  data: Float32Array,
  [left, top, right, bottom]: readonly [number, number, number, number],
  paint: number | ((x: number, y: number) => number)
): void {
  for (let y = Math.max(0, top); y < Math.min(SIDE, bottom); y++) {
    for (let x = Math.max(0, left); x < Math.min(SIDE, right); x++) {
      data[y * SIDE + x] = typeof paint === 'number' ? paint : paint(x, y);
    }
  }
}

function band(edge: Edge, from: number, to: number): [number, number, number, number] {
  const start = edge.segment * SCALE;
  const end = start + SCALE;
  const line = edge.line * SCALE;
  return edge.horizontal
    ? [start, line + from, end, line + to]
    : [line + from, start, line + to, end];
}

function drawn(paint: (data: Float32Array) => void): Plane {
  const data = new Float32Array(SIDE * SIDE).fill(FLOOR);
  paint(data);
  return { width: SIDE, height: SIDE, data };
}

function tops(
  data: Float32Array,
  edges: Iterable<Edge>,
  paint: number | ((x: number, y: number) => number)
) {
  for (const edge of edges) {
    fill(data, band(edge, -TOP_THICKNESS / 2, TOP_THICKNESS / 2), paint);
  }
}

function scoreOf(scores: EdgeScores, index: number): number {
  return index < scores.horizontal.length
    ? scores.horizontal[index]
    : scores.vertical[index - scores.horizontal.length];
}

function wrongEdges(scores: EdgeScores, layout: Layout): number {
  const inner = EDGES.map((edge, index) => ({ edge, score: scoreOf(scores, index) })).filter(
    ({ edge }) => !isBorder(edge)
  );
  const threshold = otsuThreshold(inner.map(({ score }) => score));
  return inner.filter(({ edge, score }) => score > threshold !== layout(edge)).length;
}

function openedNaively(board: Plane, width: number, across: 'rows' | 'columns'): Plane {
  const half = Math.floor(width / 2);
  const [step, count] = across === 'rows' ? [board.width, board.height] : [1, board.width];
  const slide = (data: Float32Array, pick: (a: number, b: number) => number) =>
    data.map((_, index) => {
      const position = across === 'rows' ? Math.floor(index / board.width) : index % board.width;
      let picked = Number.NaN;

      for (
        let offset = Math.max(-half, -position);
        offset <= Math.min(half, count - 1 - position);
        offset++
      ) {
        const value = data[index + offset * step];
        picked = Number.isNaN(picked) ? value : Number.isNaN(value) ? picked : pick(picked, value);
      }

      return picked;
    });
  const opened = slide(slide(board.data, Math.min), Math.max);
  return { ...board, data: board.data.map((value, index) => value - opened[index]) };
}

function noisy(width: number, height: number, seed: number): Plane {
  let state = seed;
  const next = () => (state = (state * 16807) % 2147483647) / 2147483647;
  return {
    width,
    height,
    data: Float32Array.from({ length: width * height }, () => {
      const value = next();
      return value < 0.25 ? Number.NaN : Math.round(value * 40) / 40;
    }),
  };
}

describe('classifying edges', () => {
  test('splits two clusters between them', () => {
    const threshold = otsuThreshold([0.1, 0.12, 0.08, 0.11, 0.7, 0.72, 0.69, Number.NaN]);
    expect(threshold).toBeGreaterThanOrEqual(0.12);
    expect(threshold).toBeLessThan(0.69);
    expect(otsuThreshold([0.3, 0.3])).toBe(0.3);
    expect(otsuThreshold([])).toBeNaN();
  });

  test('scores walls high and gaps low in the order of the wall sets, and not the border, half off the board', () => {
    const maze = randomMaze(4, 3);
    const scale = 16;
    const square = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ];
    const board = fitHomography(
      square,
      square.map((point) => ({ x: 10 + point.x * 40, y: 10 + point.y * 40 }))
    );
    const plane = lightness(drawBoard(maze, board, 180, 180));
    const scores = scoreEdges(
      rectify(plane, { homography: board, lens: lensOf(180, 180) }, 4, scale),
      4,
      scale
    );

    const walls: number[] = [];
    const gaps: number[] = [];

    for (let y = 1; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        (maze.horizontal.get(y * 4 + x) ? walls : gaps).push(scores.horizontal[y * 4 + x]);
      }
    }

    for (let y = 0; y < 4; y++) {
      for (let x = 1; x < 4; x++) {
        (maze.vertical.get(y * 5 + x) ? walls : gaps).push(scores.vertical[y * 5 + x]);
      }
    }

    expect(walls.length).toBeGreaterThan(2);
    expect(gaps.length).toBeGreaterThan(2);
    expect(Math.min(...walls)).toBeGreaterThan(Math.max(...gaps) + 0.2);
    expect(scores.horizontal[0]).toBeNaN();
    expect(scores.vertical[0]).toBeNaN();
    expect(scores.vertical[4]).toBeNaN();
  });

  test('splits a glared half and a clear half at one threshold once each is set against its neighbours', () => {
    const size = 8;
    const score = (index: number, x: number) =>
      (wall(index) ? 0.8 : 0.1) * (x < size / 2 ? 0.25 : 1);
    const scores = {
      horizontal: Float32Array.from({ length: (size + 1) * size }, (_, index) =>
        score(index, index % size)
      ),
      vertical: Float32Array.from({ length: size * (size + 1) }, (_, index) =>
        score(index, index % (size + 1))
      ),
    };
    const truth = Array.from(scores.horizontal, (_, index) => wall(index));

    expect(split(scores.horizontal)).not.toEqual(truth);
    expect(split(normaliseLocally(scores, size).horizontal)).toEqual(truth);
  });

  test('takes the top-hat as the naive opening does, skipping NaN', () => {
    for (const [width, height, window] of [
      [37, 29, 5],
      [8, 40, 19],
      [40, 8, 19],
      [9, 9, 31],
      [1, 12, 3],
    ]) {
      const board = noisy(width, height, width * 31 + height);

      for (const across of ['rows', 'columns'] as const) {
        const expected = openedNaively(board, window, across).data;
        const found = topHat(board, window, across).data;
        expect(Array.from(found, (value) => (Number.isNaN(value) ? 'NaN' : value))).toEqual(
          Array.from(expected, (value) => (Number.isNaN(value) ? 'NaN' : value))
        );
      }
    }
  });

  test('reads a gap under the broad light side of a nearer wall as a gap, through the top-hat', () => {
    const board = drawn((data) => {
      for (const edge of EDGES.filter(
        (candidate) => candidate.horizontal && !nearerWalls(candidate)
      )) {
        fill(data, band(edge, -12, 9), 0.7);
      }

      tops(data, EDGES.filter(nearerWalls), 0.8);
    });

    expect(wrongEdges(scoreEdges(board, SIZE, SCALE), nearerWalls)).toBe(0);
  });

  test('reads walls and gaps right under glare, per position and per neighbourhood', () => {
    const board = drawn((data) => {
      fill(data, [0, 0, SIDE, SIDE], (x) => glare(x));
      for (const edge of EDGES.filter(
        (candidate) => !candidate.horizontal && patterned(candidate)
      )) {
        fill(
          data,
          [
            edge.line * SCALE + 2,
            edge.segment * SCALE + 6,
            edge.line * SCALE + 12,
            edge.segment * SCALE + 18,
          ],
          0.85
        );
      }

      tops(
        data,
        EDGES.filter((edge) => !patterned(edge)),
        (x) => glare(x) + 0.45 * (0.95 - glare(x))
      );
      tops(data, EDGES.filter(patterned), 0.95);
    });

    expect(wrongEdges(scoreEdges(board, SIZE, SCALE), patterned)).toBe(0);
  });
});
