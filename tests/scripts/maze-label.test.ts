import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { cornersOf, readMazeLabel, type MazeLabel } from '@scripts/maze-label';

const FIXTURES = join(import.meta.dirname, '..', 'photo', 'fixtures');

const LABEL: MazeLabel = {
  schema: 'maze-label/1',
  id: 'board',
  image: { file: 'board.jpg', sha256: 'ab', width: 640, height: 480 },
  pixelConvention: 'centre-integer',
  maze: { file: 'classic/board.txt', size: 2 },
  corners: {
    oracle: {
      image: [
        [10, 10],
        [100, 10],
        [100, 100],
        [10, 100],
      ],
      inFrame: [true, true, true, true],
    },
  },
};

describe('reading a maze-label/1 file', () => {
  test.each(readdirSync(FIXTURES).filter((file) => file.endsWith('.json')))(
    'reads fixture %s',
    (file) => {
      expect(readMazeLabel(JSON.parse(readFileSync(join(FIXTURES, file), 'utf8'))).ok).toBe(true);
    }
  );

  test('reads a label with every optional part', () => {
    const full = {
      ...LABEL,
      homography: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      camera: {
        model: 'opencv',
        K: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        dist: [0.1],
        R: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        t: [0, 0, 1],
        provenance: 'exact',
        validRadius: 300,
      },
      lensFitApp: { model: 'radial-halfdiag', k1: -0.1, centre: [320, 240] },
      posts: { image: Array.from({ length: 9 }, () => null), visible: Array(9).fill(false) },
      edges: { visibleFraction: Array(12).fill(1) },
      masks: { robot: 'robot.png' },
      factors: { distortion: 'none', pxPerCell: 40 },
      provenance: { corners: 'test' },
    };
    expect(readMazeLabel(full)).toEqual({ ok: true, value: full });
  });

  test.each([
    [{ ...LABEL, schema: 'maze-label/2' }, 'label.schema is not one of maze-label/1'],
    [{ ...LABEL, image: { ...LABEL.image, width: 0 } }, 'label.image.width is not a whole number'],
    [{ ...LABEL, corners: {} }, 'label.corners has no set'],
    [{ ...LABEL, corners: { guessed: LABEL.corners.oracle } }, 'label.corners key guessed'],
    [
      { ...LABEL, corners: { oracle: { ...LABEL.corners.oracle, inFrame: [true] } } },
      'label.corners.oracle.inFrame is not a list of 4',
    ],
    [{ ...LABEL, homography: [1, 2, 3] }, 'label.homography is not a list of 9'],
    [{ ...LABEL, edges: { visibleFraction: [1] } }, 'holds 12 edges for a maze of 2'],
    [{ ...LABEL, maze: undefined }, 'label.maze is not an object'],
    [null, 'label is not an object'],
  ])('refuses %#', (value, message) => {
    const read = readMazeLabel(value);
    expect(read.ok).toBe(false);
    expect(read.ok ? '' : read.error).toContain(message);
  });
});

describe('the corners of a label', () => {
  test('are points with pixel centres at whole numbers', () => {
    expect(cornersOf({ ...LABEL, pixelConvention: 'corner-integer' }, 'oracle')).toEqual([
      { x: 9.5, y: 9.5 },
      { x: 99.5, y: 9.5 },
      { x: 99.5, y: 99.5 },
      { x: 9.5, y: 99.5 },
    ]);
  });

  test('are missing without a set from the source or with a corner not placed', () => {
    expect(cornersOf(LABEL, 'clicked')).toBeUndefined();
    const unplaced: MazeLabel = {
      ...LABEL,
      corners: {
        oracle: { image: [[1, 1], null, [3, 3], [4, 4]], inFrame: [true, false, true, true] },
      },
    };
    expect(cornersOf(unplaced, 'oracle')).toBeUndefined();
  });
});
