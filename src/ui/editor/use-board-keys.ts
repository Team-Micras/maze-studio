import { useState } from 'react';

import { edgeOfCell, toggleWall, type Cell, type CellSide, type Maze } from '@/maze';
import { boardGeometry, cellInWorld, revealCamera, type Insets, type WorldRect } from '@/render';
import type { CanvasCamera } from '@/ui/board/use-canvas-camera';

import type { MazeEditor } from './use-maze-editor';

/** A key as the board reads it. */
export interface BoardKey {
  readonly key: string;
  readonly shiftKey: boolean;
}

/** What the keyboard works on. */
export interface BoardKeysInput {
  readonly editor: MazeEditor;
  readonly camera: CanvasCamera;
  /** The maze on screen, if any. */
  readonly maze: Maze | undefined;
  readonly board: WorldRect | undefined;
  /** The room the islands leave, inside which the cursor is kept. */
  readonly insets: Insets;
  /** Whether a Shift and arrow may change a wall. */
  readonly editable: boolean;
}

/** The keyboard cursor and what the board does with a key. */
export interface BoardKeys {
  /** The cursor's cell, or `undefined` while it is hidden. */
  readonly cursor: Cell | undefined;
  /** Does what `key` asks of the board; `true` when it was the board's. */
  readonly press: (key: BoardKey) => boolean;
  /** Hides the cursor, as the pointer does when it presses. */
  readonly hide: () => void;
}

const ARROWS: Readonly<Record<string, CellSide>> = {
  ArrowUp: 'north',
  ArrowRight: 'east',
  ArrowDown: 'south',
  ArrowLeft: 'west',
};

const STEPS: Readonly<Record<CellSide, Cell>> = {
  north: { x: 0, y: 1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: -1 },
  west: { x: -1, y: 0 },
};

/** Whether `key` is an arrow, which the board takes from the tools island too. */
export function isArrow(key: string): boolean {
  return key in ARROWS;
}

function stepped(maze: Maze, cell: Cell, side: CellSide): Cell {
  const step = STEPS[side];
  return {
    x: Math.min(Math.max(cell.x + step.x, 0), maze.width - 1),
    y: Math.min(Math.max(cell.y + step.y, 0), maze.height - 1),
  };
}

/**
 * The keyboard on the board (PLAN.md 3.4, DESIGN.md 10 and 11): the first arrow shows the cell
 * cursor at the start, or at (0, 0), and every arrow moves it; Shift and an arrow toggle the wall
 * on that side of it, one step of undo each. The camera keeps the cursor inside the islands'
 * insets, without animation.
 */
export function useBoardKeys({
  editor,
  camera,
  maze,
  board,
  insets,
  editable,
}: BoardKeysInput): BoardKeys {
  const [cursor, setCursor] = useState<Cell | undefined>(undefined);

  const reveal = (cell: Cell): void => {
    const view = camera.camera;
    const viewport = camera.limits?.viewport;

    if (view !== undefined && viewport !== undefined && maze !== undefined && board !== undefined) {
      camera.set(
        revealCamera(view, cellInWorld(boardGeometry(maze), board, cell), viewport, insets)
      );
    }
  };

  const press = ({ key, shiftKey }: BoardKey): boolean => {
    const side = ARROWS[key];

    if (side === undefined || maze === undefined) {
      return false;
    }

    const shown = cursor ?? maze.start ?? { x: 0, y: 0 };

    if (shiftKey) {
      const current = editor.current();

      if (editable && current !== undefined) {
        editor.change(toggleWall(current, edgeOfCell(shown, side)));
      }

      setCursor(shown);
      reveal(shown);
      return true;
    }

    const next = cursor === undefined ? shown : stepped(maze, shown, side);
    setCursor(next);
    reveal(next);
    return true;
  };

  return { cursor, press, hide: () => setCursor(undefined) };
}
