/**
 * The compact maze code, version 1: a maze, the text after its grid and a name in a few hundred
 * characters of base64url without padding, for links and the built-in snapshot. Integers are
 * little-endian.
 *
 * | Field         | Type                                                                    |
 * | ------------- | ----------------------------------------------------------------------- |
 * | version       | u8 = 1                                                                  |
 * | width, height | u8, u8, 1 to 64                                                         |
 * | start         | u16 cell index `y × width + x`, `0xFFFF` for none                       |
 * | goal count    | u16                                                                     |
 * | goals         | u16 cell index each, ascending                                          |
 * | walls         | the bits of `horizontal` then `vertical`, least significant bit first, the last byte padded with zeros |
 * | trailer       | u16 byte length, then the trailer in UTF-8                              |
 * | name          | UTF-8 to the end; may be empty                                          |
 *
 * @module
 */

import { fromBase64Url, toBase64Url } from './base64url';
import { Bits } from './bits';
import { ByteReader, ByteWriter, ShortBufferError } from './bytes';
import {
  cellAt,
  cellIndex,
  createMaze,
  horizontalEdgeCount,
  isMazeSide,
  verticalEdgeCount,
  type Maze,
} from './maze';
import { MAX_TRAILER_BYTES } from './maze-text';
import { failure, success, type Result } from './result';

/** The version of the code this module writes, and the only one it reads. */
export const MAZE_CODE_VERSION = 1;

const NO_START = 0xffff;

/** Why a code is not a maze. */
export type MazeCodeRejection =
  | 'not-base64url'
  | 'unknown-version'
  | 'short-buffer'
  | 'size-out-of-range'
  | 'cell-out-of-range'
  | 'repeated-goal'
  | 'unordered-goals'
  | 'goal-is-start'
  | 'non-canonical'
  | 'trailer-past-end'
  | 'invalid-utf8';

/** Why a code was refused, as a reason to test against and a message to show. */
export interface MazeCodeError {
  readonly reason: MazeCodeRejection;
  readonly message: string;
}

/** What a code carries. */
export interface MazeCodeContent {
  readonly maze: Maze;
  /** The text after the grid of the file the maze came from; empty in a link. */
  readonly trailer: string;
  /** The maze's name; empty when the code has none. */
  readonly name: string;
}

class Rejected extends Error {
  readonly reason: MazeCodeRejection;

  constructor(reason: MazeCodeRejection, message: string) {
    super(message);
    this.reason = reason;
  }
}

function packWalls(maze: Maze): Uint8Array {
  const { horizontal, vertical } = maze;
  return Uint8Array.from(
    { length: Math.ceil((horizontal.length + vertical.length) / 8) },
    (_, byte) => {
      let value = 0;

      for (let bit = 0; bit < 8; bit++) {
        const index = byte * 8 + bit;
        const set =
          index < horizontal.length
            ? horizontal.get(index)
            : index - horizontal.length < vertical.length &&
              vertical.get(index - horizontal.length);
        value |= set ? 1 << bit : 0;
      }

      return value;
    }
  );
}

/**
 * The code of a maze, with the text after its grid and its name.
 *
 * @throws {RangeError} When the trailer is longer than 65,535 bytes of UTF-8.
 */
export function encodeMazeCode(
  maze: Maze,
  { trailer = '', name = '' }: { readonly trailer?: string; readonly name?: string } = {}
): string {
  const encoder = new TextEncoder();
  const trailerBytes = encoder.encode(trailer);

  if (trailerBytes.length > MAX_TRAILER_BYTES) {
    throw new RangeError(
      `the trailer has ${trailerBytes.length} bytes, past the ${MAX_TRAILER_BYTES} a code holds`
    );
  }

  const writer = new ByteWriter()
    .u8(MAZE_CODE_VERSION)
    .u8(maze.width)
    .u8(maze.height)
    .u16(maze.start === undefined ? NO_START : cellIndex(maze.width, maze.start))
    .u16(maze.goals.length);

  for (const goal of maze.goals) {
    writer.u16(cellIndex(maze.width, goal));
  }

  return toBase64Url(
    writer
      .bytes(packWalls(maze))
      .u16(trailerBytes.length)
      .bytes(trailerBytes)
      .bytes(encoder.encode(name))
      .toBytes()
  );
}

function readSize(reader: ByteReader): { width: number; height: number } {
  const width = reader.u8();
  const height = reader.u8();

  if (!isMazeSide(width) || !isMazeSide(height)) {
    throw new Rejected(
      'size-out-of-range',
      `a maze is 1 to 64 cells a side, not ${width}×${height}`
    );
  }

  return { width, height };
}

function inside(index: number, cells: number, what: string): number {
  if (index >= cells) {
    throw new Rejected('cell-out-of-range', `the ${what} is cell ${index} of a maze of ${cells}`);
  }

  return index;
}

function readGoals(reader: ByteReader, cells: number, start: number | undefined): number[] {
  const count = reader.u16();
  const goals: number[] = [];

  for (let read = 0; read < count; read++) {
    const goal = inside(reader.u16(), cells, 'goal');
    const previous = goals.at(-1) ?? -1;

    if (goal === previous) {
      throw new Rejected('repeated-goal', `goal cell ${goal} is given twice`);
    }

    if (goal < previous) {
      throw new Rejected('unordered-goals', `goal cell ${goal} comes after cell ${previous}`);
    }

    if (goal === start) {
      throw new Rejected('goal-is-start', `cell ${goal} is both the start and a goal`);
    }

    goals.push(goal);
  }

  return goals;
}

function readWalls(
  reader: ByteReader,
  width: number,
  height: number
): { horizontal: Bits; vertical: Bits } {
  const horizontalCount = horizontalEdgeCount(width, height);
  const verticalCount = verticalEdgeCount(width, height);
  const packed = reader.bytes(Math.ceil((horizontalCount + verticalCount) / 8));
  const bit = (index: number) => ((packed[index >> 3] ?? 0) & (1 << (index & 7))) !== 0;
  const used = horizontalCount + verticalCount;

  if (used % 8 !== 0 && (packed.at(-1) ?? 0) >> (used % 8) !== 0) {
    throw new Rejected('non-canonical', 'the padding bits after the last wall are not zero');
  }

  return {
    horizontal: Bits.from(horizontalCount, bit),
    vertical: Bits.from(verticalCount, (index) => bit(horizontalCount + index)),
  };
}

function utf8(bytes: Uint8Array, what: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Rejected('invalid-utf8', `the ${what} is not valid UTF-8`);
  }
}

function readTrailer(reader: ByteReader): string {
  const length = reader.u16();

  if (length > reader.left) {
    throw new Rejected(
      'trailer-past-end',
      `the trailer has ${length} bytes, but only ${reader.left} are left`
    );
  }

  return utf8(reader.bytes(length), 'trailer');
}

function readContent(reader: ByteReader): MazeCodeContent {
  const version = reader.u8();

  if (version !== MAZE_CODE_VERSION) {
    throw new Rejected('unknown-version', `version ${version} of the maze code is unknown`);
  }

  const { width, height } = readSize(reader);
  const cells = width * height;
  const startIndex = reader.u16();
  const start = startIndex === NO_START ? undefined : inside(startIndex, cells, 'start');
  const goals = readGoals(reader, cells, start);
  const walls = readWalls(reader, width, height);
  const trailer = readTrailer(reader);
  const name = utf8(reader.rest(), 'name');

  return Object.freeze({
    maze: createMaze({
      width,
      height,
      ...walls,
      start: start === undefined ? undefined : cellAt(width, start),
      goals: goals.map((goal) => cellAt(width, goal)),
    }),
    trailer,
    name,
  });
}

/**
 * Reads a maze code.
 *
 * @returns What the code carries, or why it is refused.
 */
export function decodeMazeCode(code: string): Result<MazeCodeContent, MazeCodeError> {
  const bytes = fromBase64Url(code);

  if (bytes === undefined) {
    return failure({ reason: 'not-base64url', message: 'the code is not base64url text' });
  }

  try {
    return success(readContent(new ByteReader(bytes)));
  } catch (error) {
    if (error instanceof Rejected) {
      return failure({ reason: error.reason, message: error.message });
    }

    if (error instanceof ShortBufferError) {
      return failure({ reason: 'short-buffer', message: `the code ends early: ${error.message}` });
    }

    throw error;
  }
}
