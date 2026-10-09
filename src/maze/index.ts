/**
 * The maze core: the model, the mazefiles text format and the compact code. Pure TypeScript, with
 * no React, no browser API beyond text encoding, and no other module of maze-studio.
 *
 * @module
 */

export { Bits } from './bits';
export {
  cellAt,
  cellIndex,
  createMaze,
  horizontalEdgeCount,
  horizontalEdgeIndex,
  isMazeSide,
  MAX_SIDE,
  mazesEqual,
  MIN_SIDE,
  verticalEdgeCount,
  verticalEdgeIndex,
  type Cell,
  type Maze,
  type MazeParts,
} from './maze';
export {
  decodeMazeCode,
  encodeMazeCode,
  MAZE_CODE_VERSION,
  type MazeCodeContent,
  type MazeCodeError,
  type MazeCodeRejection,
} from './maze-code';
export {
  MAX_TRAILER_BYTES,
  type Irregularity,
  type IrregularityKind,
  type MazeText,
  type MazeTextError,
  type MazeTextSource,
} from './maze-text';
export { parseMazeText } from './parse-maze-text';
export type { Result } from './result';
export { mazeGridText, serializeMazeText } from './serialize-maze-text';
