import { useEffect, useRef, useState } from 'react';

import {
  clearArea,
  sameCell,
  setGoalArea,
  setGoals,
  setStart,
  toggleGoal,
  wallRectangle,
  type Cell,
  type CellArea,
  type Maze,
} from '@/maze';
import {
  boardGeometry,
  cellOnScreen,
  MIN_TOUCH_CELL,
  mazePointAt,
  nearestCell,
  toWorld,
  type ScreenPoint,
  type WorldRect,
} from '@/render';
import type { DrawInput, StageDrawing } from '@/ui/board/camera-stage';
import type { CanvasCamera } from '@/ui/board/use-canvas-camera';

import type { Tool } from './tools';
import type { MazeEditor } from './use-maze-editor';

/** The tools that work on cells rather than wall slots. */
export type CellTool = Extract<Tool, 'rectangle' | 'clear' | 'start' | 'goal'>;

/** Whether `tool` works on cells. */
export function isCellTool(tool: Tool): tool is CellTool {
  return tool === 'rectangle' || tool === 'clear' || tool === 'start' || tool === 'goal';
}

/**
 * What a cell tool does to `maze` with the cells from `anchor` to `cell`: a rectangle of walls,
 * the walls inside cleared, the start on `cell`, or the goals. For the goal, a single cell
 * replaces the goals, or, with Shift, comes in or out of them; an area replaces them.
 */
export function cellEdit(
  maze: Maze,
  tool: CellTool,
  anchor: Cell,
  cell: Cell,
  shiftKey: boolean
): Maze {
  const area: CellArea = { from: anchor, to: cell };

  switch (tool) {
    case 'rectangle':
      return wallRectangle(maze, area);
    case 'clear':
      return clearArea(maze, area);
    case 'start':
      return setStart(maze, cell);
    default:
      if (!sameCell(anchor, cell)) {
        return setGoalArea(maze, area);
      }

      return shiftKey ? toggleGoal(maze, cell) : setGoals(maze, [cell]);
  }
}

/** What a cell tool draws on. */
export interface CellDrawingInput {
  readonly editor: MazeEditor;
  readonly camera: CanvasCamera;
  readonly maze: Maze | undefined;
  readonly board: WorldRect | undefined;
  /** The cell tool picked, or none when another tool, or none at all, draws. */
  readonly tool: CellTool | undefined;
  readonly onTooSmall: () => void;
  readonly onPress: () => void;
}

/** A cell tool's gestures for the stage, and the cells it selects meanwhile. */
export interface CellDrawing {
  readonly drawing: StageDrawing | undefined;
  readonly selection: CellArea | undefined;
}

interface Gesture {
  readonly base: Maze;
  readonly tool: CellTool;
  readonly anchor: Cell;
  readonly shiftKey: boolean;
  cell: Cell;
}

/**
 * The cell tools (PLAN.md 3.4, DESIGN.md 10): a press picks a cell and a drag spans a rectangle of
 * cells, shown as the selection, which the release applies as one step of undo. Shift with a goal
 * click adds or removes the cell; Shift with a drag is a plain drag. A touch on cells under 28 px
 * does not edit.
 */
export function useCellDrawing({
  editor,
  camera,
  maze,
  board,
  tool,
  onTooSmall,
  onPress,
}: CellDrawingInput): CellDrawing {
  const [selection, setSelection] = useState<CellArea | undefined>(undefined);
  const gesture = useRef<Gesture | undefined>(undefined);
  const active = tool !== undefined && maze !== undefined && board !== undefined;

  useEffect(() => {
    if (!active && gesture.current !== undefined) {
      gesture.current = undefined;
      editor.end();
    }
  });

  if (!active) {
    return { drawing: undefined, selection: undefined };
  }

  const geometry = boardGeometry(maze);

  const cellAt = (point: ScreenPoint): Cell | undefined => {
    const view = camera.camera;
    return view === undefined
      ? undefined
      : nearestCell(maze, mazePointAt(geometry, board, toWorld(view, point)));
  };

  const begin = (point: ScreenPoint, input: DrawInput): boolean => {
    const cell = cellAt(point);
    const base = editor.current();

    if (cell === undefined || base === undefined) {
      return false;
    }

    if (
      input.pointerType === 'touch' &&
      cellOnScreen(geometry, board, camera.camera?.k ?? 0) < MIN_TOUCH_CELL
    ) {
      onTooSmall();
      return false;
    }

    onPress();
    editor.begin();
    gesture.current = { base, tool, anchor: cell, cell, shiftKey: input.shiftKey };
    setSelection(tool === 'start' ? undefined : { from: cell, to: cell });
    return true;
  };

  const move = (points: readonly ScreenPoint[]): void => {
    const current = gesture.current;
    const last = points.at(-1);
    const cell = last === undefined ? undefined : cellAt(last);

    if (current === undefined || cell === undefined || sameCell(cell, current.cell)) {
      return;
    }

    current.cell = cell;
    setSelection(current.tool === 'start' ? undefined : { from: current.anchor, to: cell });
  };

  const end = (): void => {
    const current = gesture.current;
    gesture.current = undefined;
    setSelection(undefined);

    if (current !== undefined) {
      editor.change(
        cellEdit(current.base, current.tool, current.anchor, current.cell, current.shiftKey)
      );
    }

    editor.end();
  };

  const cancel = (): void => {
    gesture.current = undefined;
    setSelection(undefined);
    editor.cancel();
  };

  return { drawing: { begin, move, end, cancel }, selection };
}
