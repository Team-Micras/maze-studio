/**
 * The maze core: the model, its edits and their history, the mazefiles text format, the compact
 * code and validation. Pure TypeScript, with
 * no React, no browser API beyond text encoding, and no other module of maze-studio.
 *
 * @module
 */

export { Bits } from './bits';
export { edgeIndex, edgeOfCell, hasWall, isMazeEdge, type CellSide, type Edge } from './edges';
export {
  clearArea,
  clearStart,
  fillBorder,
  paintWalls,
  setGoals,
  setStart,
  setWall,
  toggleGoal,
  toggleWall,
  wallRectangle,
  type CellArea,
} from './edits';
export {
  beginGesture,
  canRedo,
  canUndo,
  createHistory,
  endGesture,
  HISTORY_LIMIT,
  inGesture,
  record,
  redo,
  undo,
  type History,
  type HistoryOptions,
} from './history';
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
export {
  profileOfPath,
  RULE_SEVERITIES,
  RULES,
  validateMaze,
  type Finding,
  type Post,
  type Problem,
  type Profile,
  type Rule,
  type Severity,
  type ValidationInput,
} from './validation';
