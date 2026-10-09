/**
 * Reading a maze document from the mazefiles text format.
 *
 * Where the grid ends is decided by its shape, not by the first character of a line as the
 * repository's own test does, since a maze with an open west border has cell lines that start
 * with a space: the first line is a line of posts, an `o` every 4 columns; then lines alternate
 * between cell lines, which start with `|` or a space, and lines of posts, all as long as the
 * first; the grid ends at the first line that breaks that shape, and must end on a line of posts.
 * A cell line shorter than the first, as when an editor strips the spaces at the end of a line
 * of a maze whose east border is open, is part of the grid when a line of posts follows it; it is
 * read as if padded with spaces, and reported.
 * Anything inside that shape that the canonical text writes differently is an irregularity, read
 * in a fixed way and reported; anything outside it refuses the text, with the line and column.
 *
 * @module
 */

import { Bits } from './bits';
import {
  createMaze,
  horizontalEdgeCount,
  MAX_SIDE,
  verticalEdgeCount,
  type Cell,
  type Maze,
} from './maze';
import {
  MAX_TRAILER_BYTES,
  type Irregularity,
  type IrregularityKind,
  type MazeText,
  type MazeTextError,
} from './maze-text';
import { failure, success, type Result } from './result';
import {
  BLANK,
  COLUMNS_PER_CELL,
  GOAL_MARK,
  HORIZONTAL_WALL,
  lineCount,
  lineLength,
  NO_HORIZONTAL_WALL,
  POST,
  START_MARK,
  VERTICAL_WALL,
} from './text-layout';

interface Grid {
  readonly lines: readonly string[];
  readonly width: number;
  readonly height: number;
}

type Report = (kind: IrregularityKind, line: number, column: number, found: string) => void;

function misplacedPost(line: string, length: number): number | undefined {
  for (let column = 0; column < Math.min(line.length, length); column += COLUMNS_PER_CELL) {
    if (line[column] !== POST) {
      return column;
    }
  }

  return undefined;
}

function postLineColumn(line: string, length: number): number {
  return (misplacedPost(line, length) ?? Math.min(line.length, length)) + 1;
}

function firstLineError(line: string): MazeTextError | undefined {
  const misplaced = misplacedPost(line, line.length);

  if (misplaced !== undefined) {
    return {
      line: 1,
      column: misplaced + 1,
      message: 'the first line must be a line of posts, an `o` every 4 columns',
    };
  }

  if (line.length < lineLength(1) || (line.length - 1) % COLUMNS_PER_CELL !== 0) {
    return {
      line: 1,
      column: line.length + 1,
      message: 'a line of posts ends with a post, 4 columns after the one before',
    };
  }

  if (line.length > lineLength(MAX_SIDE)) {
    return {
      line: 1,
      column: lineLength(MAX_SIDE) + 1,
      message: `a maze is at most ${MAX_SIDE} cells wide`,
    };
  }

  return undefined;
}

function startsCellLine(line: string): boolean {
  return line === '' || line[0] === VERTICAL_WALL || line[0] === BLANK;
}

function isPostLine(line: string | undefined, length: number): boolean {
  return line?.length === length && misplacedPost(line, length) === undefined;
}

function isCellLine(lines: readonly string[], index: number, length: number): boolean {
  const line = lines[index];

  if (line === undefined || line.length > length || !startsCellLine(line)) {
    return false;
  }

  return line.length === length || isPostLine(lines[index + 1], length);
}

function fitsGrid(lines: readonly string[], index: number, length: number): boolean {
  return index % 2 === 0 ? isPostLine(lines[index], length) : isCellLine(lines, index, length);
}

function missingCellsError(lines: readonly string[], length: number): MazeTextError {
  const line = lines[1] ?? '';

  if (startsCellLine(line) && line.length < length && lines[2] !== undefined) {
    return {
      line: 3,
      column: postLineColumn(lines[2], length),
      message: 'expected a line of posts as long as the first, an `o` every 4 columns',
    };
  }

  if (startsCellLine(line) && line.length > length) {
    return {
      line: 2,
      column: length + 1,
      message: 'a line of cells is no longer than the first line',
    };
  }

  return {
    line: 2,
    column: 1,
    message: 'expected a line of cells, starting with `|` or a space',
  };
}

function measureGrid(lines: readonly string[]): Result<Grid, MazeTextError> {
  const first = lines[0] ?? '';
  const error = firstLineError(first);

  if (error !== undefined) {
    return failure(error);
  }

  let count = 1;

  while (fitsGrid(lines, count, first.length)) {
    if (count === lineCount(MAX_SIDE)) {
      return failure({
        line: count + 1,
        column: 1,
        message: `a maze is at most ${MAX_SIDE} cells tall`,
      });
    }

    count += 1;
  }

  if (count === 1) {
    return failure(missingCellsError(lines, first.length));
  }

  if (count % 2 === 0) {
    return failure({
      line: count + 1,
      column: postLineColumn(lines[count] ?? '', first.length),
      message: 'expected a line of posts as long as the first, an `o` every 4 columns',
    });
  }

  return success({
    lines: lines.slice(0, count),
    width: (first.length - 1) / COLUMNS_PER_CELL,
    height: (count - 1) / 2,
  });
}

function padShortLines(grid: Grid, report: Report): Grid {
  const length = lineLength(grid.width);
  const lines = grid.lines.map((line, index) => {
    if (line.length < length) {
      report('short-line', index + 1, line.length + 1, '');
    }

    return line.padEnd(length, BLANK);
  });

  return { ...grid, lines };
}

function readHorizontal({ lines, width, height }: Grid, report: Report): Bits {
  return Bits.from(horizontalEdgeCount(width, height), (index) => {
    const line = 2 * (height - Math.floor(index / width));
    const column = COLUMNS_PER_CELL * (index % width) + 1;
    const segment = (lines[line] ?? '').slice(column, column + HORIZONTAL_WALL.length);

    if (segment !== HORIZONTAL_WALL && segment !== NO_HORIZONTAL_WALL) {
      report('wall', line + 1, column + 1, segment);
    }

    return segment[1] === HORIZONTAL_WALL[1];
  });
}

function readVertical({ lines, width, height }: Grid, report: Report): Bits {
  return Bits.from(verticalEdgeCount(width, height), (index) => {
    const line = 2 * (height - Math.floor(index / (width + 1))) - 1;
    const column = COLUMNS_PER_CELL * (index % (width + 1));
    const found = lines[line]?.[column] ?? '';

    if (found !== VERTICAL_WALL && found !== BLANK) {
      report('wall', line + 1, column + 1, found);
    }

    return found === VERTICAL_WALL;
  });
}

function readMarks(
  { lines, width, height }: Grid,
  report: Report
): { start: Cell | undefined; goals: Cell[] } {
  let start: Cell | undefined;
  const goals: Cell[] = [];

  for (let line = 1; line < lines.length; line += 2) {
    const y = height - (line + 1) / 2;

    for (let x = 0; x < width; x++) {
      const column = COLUMNS_PER_CELL * x + 1;
      const text = (lines[line] ?? '').slice(column, column + 3);
      const [before, mark, after] = text;

      if (
        before !== BLANK ||
        after !== BLANK ||
        ![BLANK, START_MARK, GOAL_MARK].includes(mark ?? '')
      ) {
        report('cell', line + 1, column + 1, text);
      }

      if (mark === GOAL_MARK) {
        goals.push({ x, y });
      } else if (mark === START_MARK && start !== undefined) {
        report('extra-start', line + 1, column + 2, mark);
      } else if (mark === START_MARK) {
        start = { x, y };
      }
    }
  }

  return { start, goals };
}

const GRID_CHARACTERS = /^[ |SG]+$/;

function looksLikeGrid(next: string, after: string | undefined): boolean {
  if (next.startsWith(POST) || next.startsWith(VERTICAL_WALL)) {
    return true;
  }

  return next.startsWith(BLANK) && (after?.startsWith(POST) === true || GRID_CHARACTERS.test(next));
}

function readTrailer(lines: readonly string[], gridLines: number, report: Report): string {
  const next = lines[gridLines] ?? '';
  const trailer = lines.slice(gridLines).join('\n');
  const bytes = new TextEncoder().encode(trailer).length;

  if (looksLikeGrid(next, lines[gridLines + 1])) {
    report('ragged-line', gridLines + 1, 1, next);
  }

  if (bytes > MAX_TRAILER_BYTES) {
    report('long-trailer', gridLines + 1, 1, `${bytes} bytes`);
  }

  return trailer;
}

function readMaze(measured: Grid, report: Report): Maze {
  const grid = padShortLines(measured, report);
  return createMaze({
    width: grid.width,
    height: grid.height,
    horizontal: readHorizontal(grid, report),
    vertical: readVertical(grid, report),
    ...readMarks(grid, report),
  });
}

/**
 * Reads a maze document from text in the mazefiles format. Carriage returns and a missing final
 * line feed are accepted and normalized; irregularities inside the grid are read in a fixed way;
 * all three are recorded in the document's `source`.
 *
 * @param text The whole file.
 * @param fileName The name or repository path of the file, kept in `source`.
 * @returns The document, or why the text is not a maze with the line and column where it is not.
 */
export function parseMazeText(text: string, fileName: string): Result<MazeText, MazeTextError> {
  const hadCR = text.includes('\r');
  const unix = text.replaceAll(/\r\n?/g, '\n');
  const hadFinalNewline = unix.endsWith('\n');
  const lines = (hadFinalNewline ? unix : `${unix}\n`).split('\n');
  const measured = measureGrid(lines);

  if (!measured.ok) {
    return measured;
  }

  const irregularities: Irregularity[] = [];
  const report: Report = (kind, line, column, found) =>
    irregularities.push(Object.freeze({ kind, line, column, found }));
  const maze = readMaze(measured.value, report);
  const trailer = readTrailer(lines, measured.value.lines.length, report);

  return success(
    Object.freeze({
      maze,
      trailer,
      source: Object.freeze({
        fileName,
        irregularities: Object.freeze(
          irregularities.toSorted(
            (left, right) => left.line - right.line || left.column - right.column
          )
        ),
        hadCR,
        hadFinalNewline,
      }),
    })
  );
}
