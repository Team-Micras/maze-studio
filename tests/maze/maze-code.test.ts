import { describe, expect, test } from 'vitest';

import {
  Bits,
  createMaze,
  decodeMazeCode,
  encodeMazeCode,
  mazesEqual,
  type MazeCodeContent,
  type MazeCodeRejection,
} from '@/maze';
import { fromBase64Url, toBase64Url } from '@/maze/base64url';
import { ByteWriter } from '@/maze/bytes';

const TWO_BY_TWO = createMaze({
  width: 2,
  height: 2,
  horizontal: Bits.from(6, (index) => index !== 2),
  vertical: Bits.from(6, (index) => index !== 4),
  start: { x: 0, y: 0 },
  goals: [{ x: 0, y: 1 }],
});

function decoded(code: string): MazeCodeContent {
  const result = decodeMazeCode(code);

  if (!result.ok) {
    throw new Error(`${result.error.reason}: ${result.error.message}`);
  }

  return result.value;
}

function rejection(bytes: Uint8Array | string): MazeCodeRejection | undefined {
  const result = decodeMazeCode(typeof bytes === 'string' ? bytes : toBase64Url(bytes));
  return result.ok ? undefined : result.error.reason;
}

function header(
  width: number,
  height: number,
  start: number,
  goals: readonly number[]
): ByteWriter {
  const writer = new ByteWriter().u8(1).u8(width).u8(height).u16(start).u16(goals.length);

  for (const goal of goals) {
    writer.u16(goal);
  }

  return writer;
}

function boxed(width: number, height: number, goalSide: number): ReturnType<typeof createMaze> {
  const first = Math.floor((width - goalSide) / 2);
  return createMaze({
    width,
    height,
    horizontal: Bits.from((height + 1) * width, (index) => index % 3 === 0),
    vertical: Bits.from(height * (width + 1), (index) => index % 5 === 0),
    start: { x: 0, y: 0 },
    goals: Array.from({ length: goalSide * goalSide }, (_, index) => ({
      x: first + (index % goalSide),
      y: first + Math.floor(index / goalSide),
    })),
  });
}

describe('the compact maze code, version 1', () => {
  test('lays out the fields as the plan says, little-endian, walls least significant bit first', () => {
    const code = encodeMazeCode(TWO_BY_TWO, { name: 'ab' });

    expect([...(fromBase64Url(code) ?? [])]).toEqual([
      1, 2, 2, 0, 0, 1, 0, 2, 0, 0b1111_1011, 0b0000_1011, 0, 0, 0x61, 0x62,
    ]);
  });

  test('writes 0xFFFF for no start, and u16 indices past 255', () => {
    const maze = createMaze({ width: 64, height: 64, goals: [{ x: 63, y: 63 }] });
    expect(Array.from(fromBase64Url(encodeMazeCode(maze)) ?? []).slice(0, 9)).toEqual([
      1, 64, 64, 0xff, 0xff, 1, 0, 0xff, 0x0f,
    ]);
  });

  test('reads back the maze, the trailer and the name', () => {
    const content = decoded(encodeMazeCode(TWO_BY_TWO, { trailer: '﻿notes ✓\n', name: 'Ünï 2026' }));

    expect(mazesEqual(content.maze, TWO_BY_TWO)).toBe(true);
    expect(content.trailer).toBe('﻿notes ✓\n');
    expect(content.name).toBe('Ünï 2026');
    expect(decoded(encodeMazeCode(TWO_BY_TWO))).toMatchObject({ trailer: '', name: '' });
  });

  test('fits a 16×16 maze with a 2×2 goal in about 116 characters and a 32×32 with 3×3 in about 390', () => {
    expect(encodeMazeCode(boxed(16, 16, 2)).length).toBeLessThanOrEqual(116);
    expect(encodeMazeCode(boxed(32, 32, 3)).length).toBeLessThanOrEqual(390);
  });

  test('carries a trailer up to 65,535 bytes and refuses a longer one', () => {
    const longest = 'a'.repeat(65_535);
    expect(decoded(encodeMazeCode(TWO_BY_TWO, { trailer: longest })).trailer).toBe(longest);
    expect(() => encodeMazeCode(TWO_BY_TWO, { trailer: `${longest}a` })).toThrow(RangeError);
    expect(() => encodeMazeCode(TWO_BY_TWO, { trailer: 'é'.repeat(32_768) })).toThrow(RangeError);
  });

  describe('refuses, with the reason,', () => {
    const walls = new Uint8Array(2);
    const tail = (writer: ByteWriter) => writer.bytes(walls).u16(0).toBytes();

    test('a code that is not base64url', () => {
      expect(rejection('AQ==')).toBe('not-base64url');
      expect(rejection('a+b/')).toBe('not-base64url');
      expect(rejection('A')).toBe('not-base64url');
    });

    test('an unknown version', () => {
      expect(rejection(Uint8Array.from([0, 2, 2]))).toBe('unknown-version');
      expect(rejection(Uint8Array.from([2, 2, 2]))).toBe('unknown-version');
    });

    test('a buffer that ends early', () => {
      const whole = fromBase64Url(encodeMazeCode(TWO_BY_TWO)) ?? new Uint8Array();
      expect(rejection('')).toBe('short-buffer');

      for (let length = 1; length < whole.length; length++) {
        expect(rejection(whole.subarray(0, length))).toBe('short-buffer');
      }
    });

    test('a side outside 1 to 64', () => {
      expect(rejection(tail(header(0, 2, 0xffff, [])))).toBe('size-out-of-range');
      expect(rejection(tail(header(2, 0, 0xffff, [])))).toBe('size-out-of-range');
      expect(rejection(tail(header(65, 2, 0xffff, [])))).toBe('size-out-of-range');
      expect(rejection(tail(header(2, 65, 0xffff, [])))).toBe('size-out-of-range');
    });

    test('a start or goal index past the last cell', () => {
      expect(rejection(tail(header(2, 2, 4, [])))).toBe('cell-out-of-range');
      expect(rejection(tail(header(2, 2, 0xfffe, [])))).toBe('cell-out-of-range');
      expect(rejection(tail(header(2, 2, 0, [4])))).toBe('cell-out-of-range');
      expect(decodeMazeCode(toBase64Url(tail(header(2, 2, 3, [0, 1, 2])))).ok).toBe(true);
    });

    test('a goal repeated, goals out of order, and a goal on the start', () => {
      expect(rejection(tail(header(2, 2, 0xffff, [1, 1])))).toBe('repeated-goal');
      expect(rejection(tail(header(2, 2, 0xffff, [2, 1])))).toBe('unordered-goals');
      expect(rejection(tail(header(2, 2, 1, [0, 1])))).toBe('goal-is-start');
    });

    test('a trailer longer than what is left', () => {
      const bytes = header(2, 2, 0, [])
        .bytes(walls)
        .u16(3)
        .bytes(Uint8Array.from([0x61, 0x62]))
        .toBytes();
      expect(rejection(bytes)).toBe('trailer-past-end');
    });

    test('a trailer or a name that is not UTF-8', () => {
      const badTrailer = header(2, 2, 0, [])
        .bytes(walls)
        .u16(1)
        .bytes(Uint8Array.from([0xff]))
        .toBytes();
      const badName = header(2, 2, 0, [])
        .bytes(walls)
        .u16(0)
        .bytes(Uint8Array.from([0xc3]))
        .toBytes();
      expect(rejection(badTrailer)).toBe('invalid-utf8');
      expect(rejection(badName)).toBe('invalid-utf8');
    });
  });
});
