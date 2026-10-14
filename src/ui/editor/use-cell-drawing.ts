import { useState } from 'react';

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
import { nearestCell, type ScreenPoint } from '@/render';
import type { DrawInput, StageDrawing } from '@/ui/board/camera-stage';

import type { Tool } from './tools';
import { useBoardGesture, type BoardGestureInput } from './use-board-gesture';

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

/** What a cell tool draws on: the cell tool picked, or none when another tool, or none, draws. */
export interface CellDrawingInput extends Omit<BoardGestureInput, 'enabled'> {
  readonly tool: CellTool | undefined;
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
export function useCellDrawing({ tool, ...setup }: CellDrawingInput): CellDrawing {
  const { editor } = setup;
  const [selection, setSelection] = useState<CellArea | undefined>(undefined);
  const gesture = useBoardGesture<Gesture>({ ...setup, enabled: tool !== undefined });

  if (gesture === undefined || tool === undefined) {
    return { drawing: undefined, selection: undefined };
  }

  const { maze } = gesture;

  const cellAt = (point: ScreenPoint): Cell | undefined => {
    const at = gesture.mazePoint(point);
    return at === undefined ? undefined : nearestCell(maze, at);
  };

  const begin = (point: ScreenPoint, input: DrawInput): boolean => {
    const current = gesture.begin(point, input, (at, base) => {
      const cell = nearestCell(maze, at);
      return { base, tool, anchor: cell, cell, shiftKey: input.shiftKey };
    });

    if (current === undefined) {
      return false;
    }

    setSelection(tool === 'start' ? undefined : { from: current.cell, to: current.cell });
    return true;
  };

  const move = (points: readonly ScreenPoint[]): void => {
    const current = gesture.current();
    const last = points.at(-1);
    const cell = last === undefined ? undefined : cellAt(last);

    if (current === undefined || cell === undefined || sameCell(cell, current.cell)) {
      return;
    }

    current.cell = cell;
    setSelection(current.tool === 'start' ? undefined : { from: current.anchor, to: cell });
  };

  const end = (): void => {
    const current = gesture.finish();
    setSelection(undefined);

    if (current !== undefined) {
      editor.change(
        cellEdit(current.base, current.tool, current.anchor, current.cell, current.shiftKey)
      );
    }

    editor.end();
  };

  const cancel = (): void => {
    gesture.finish();
    setSelection(undefined);
    editor.cancel();
  };

  return { drawing: { begin, move, end, cancel }, selection };
}
