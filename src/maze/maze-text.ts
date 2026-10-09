/**
 * A maze as a document of the mazefiles text format: the grid, read into a {@link Maze}, and the
 * rest of the file after it, kept as it came.
 *
 * @module
 */

import type { Maze } from './maze';

/** The most bytes of UTF-8 the text after the grid may have to fit in a link or the snapshot. */
export const MAX_TRAILER_BYTES = 65_535;

/**
 * Something inside the grid that the canonical text would write differently, or right after it
 * that may belong to it. The maze reads each one in a fixed way; writing the maze back fixes it.
 *
 * - `wall`: an east–west segment other than `---` or three spaces (a wall when its middle
 *   character is `-`), or a post column of a cell line with other than `|` or a space (a wall
 *   only for `|`).
 * - `cell`: a cell whose mark is not `S`, `G` or a space, which reads as unmarked, or whose
 *   columns beside the mark are not spaces, which are ignored.
 * - `extra-start`: an `S` after the first one in reading order; that cell is unmarked.
 * - `short-line`: a cell line shorter than the first line, read as if padded with spaces; `found`
 *   is empty, and `column` is where the line ended.
 * - `ragged-line`: the line right after the grid looks like more of it but breaks its shape, so
 *   the grid may have ended early: it starts with `o` or `|`, or it starts with a space and
 *   either holds only grid characters (spaces, `|`, `S`, `G`) or comes before a line starting
 *   with `o`.
 * - `long-trailer`: the text after the grid is longer than the 65,535 bytes of UTF-8 a link or
 *   snapshot can carry.
 */
export type IrregularityKind =
  | 'wall'
  | 'cell'
  | 'extra-start'
  | 'short-line'
  | 'ragged-line'
  | 'long-trailer';

/** One irregularity of a file, where it starts and the text found there. */
export interface Irregularity {
  readonly kind: IrregularityKind;
  /** The line, from 1. */
  readonly line: number;
  /** The column, from 1. */
  readonly column: number;
  /** The text found. */
  readonly found: string;
}

/** The file a document was read from, as it came, before anything normalized it. */
export interface MazeTextSource {
  /** The name or repository path of the file. */
  readonly fileName: string;
  /** What the canonical text writes differently, in the order of the file. */
  readonly irregularities: readonly Irregularity[];
  /** Whether the file had carriage returns, which reading turned into plain line feeds. */
  readonly hadCR: boolean;
  /** Whether the file ended with a line feed; reading added one when it did not. */
  readonly hadFinalNewline: boolean;
}

/** A maze document: the maze, the text after the grid, and the file it came from, if unchanged. */
export interface MazeText {
  readonly maze: Maze;
  /** Everything after the line feed that ends the grid's last line, kept byte for byte. */
  readonly trailer: string;
  /** The file as it came; absent once the document is edited or normalized. */
  readonly source?: MazeTextSource;
}

/** Why a text is not a maze, and where reading it stopped, both from 1. */
export interface MazeTextError {
  readonly line: number;
  readonly column: number;
  readonly message: string;
}
