import { useEffect, useRef } from 'react';

import type { Maze } from '@/maze';
import {
  boardGeometry,
  cellOnScreen,
  MIN_TOUCH_CELL,
  mazePointAt,
  toWorld,
  type MazePoint,
  type ScreenPoint,
  type WorldRect,
} from '@/render';
import type { DrawInput } from '@/ui/board/camera-stage';
import type { CanvasCamera } from '@/ui/board/use-canvas-camera';

import type { MazeEditor } from './use-maze-editor';

/** What a drawing tool draws on. */
export interface BoardGestureInput {
  readonly editor: MazeEditor;
  readonly camera: CanvasCamera;
  /** The maze on screen, if any. */
  readonly maze: Maze | undefined;
  /** Where its board lies in the world. */
  readonly board: WorldRect | undefined;
  /** Whether the tool draws now. */
  readonly enabled: boolean;
  /** Called when a touch lands on cells too small to edit by touch. */
  readonly onTooSmall: () => void;
  /** Called when a gesture starts, which hides the keyboard cursor. */
  readonly onPress: () => void;
}

/** The part of a drawing gesture every tool shares, while the tool draws on a maze. */
export interface BoardGesture<G> {
  readonly maze: Maze;
  /** The gesture under way, which the tool updates as it goes. */
  readonly current: () => G | undefined;
  /** The maze point under a point of the stage, once the camera is measured. */
  readonly mazePoint: (point: ScreenPoint) => MazePoint | undefined;
  /**
   * Starts a gesture at `point`, made by `make` from the maze point and the maze before it, unless
   * the camera is not measured, nothing is open or a touch lands on cells under 28 px.
   */
  readonly begin: (
    point: ScreenPoint,
    input: DrawInput,
    make: (at: MazePoint, base: Maze) => G
  ) => G | undefined;
  /** Ends the gesture under way and returns it. */
  readonly finish: () => G | undefined;
}

/**
 * What the wall and cell tools share: the gesture under way, ended when the tool stops drawing,
 * the stage's points in the maze, and the start of a gesture, refused on cells too small to edit by
 * touch. Undefined while the tool does not draw.
 */
export function useBoardGesture<G>({
  editor,
  camera,
  maze,
  board,
  enabled,
  onTooSmall,
  onPress,
}: BoardGestureInput): BoardGesture<G> | undefined {
  const gesture = useRef<G | undefined>(undefined);
  const active = enabled && maze !== undefined && board !== undefined;

  useEffect(() => {
    if (!active && gesture.current !== undefined) {
      gesture.current = undefined;
      editor.end();
    }
  });

  if (!active) {
    return undefined;
  }

  const geometry = boardGeometry(maze);

  const mazePoint = (point: ScreenPoint): MazePoint | undefined => {
    const view = camera.camera;
    return view === undefined ? undefined : mazePointAt(geometry, board, toWorld(view, point));
  };

  return {
    maze,
    current: () => gesture.current,
    mazePoint,
    begin: (point, input, make) => {
      const at = mazePoint(point);
      const base = editor.current();

      if (at === undefined || base === undefined) {
        return undefined;
      }

      if (
        input.pointerType === 'touch' &&
        cellOnScreen(geometry, board, camera.camera?.k ?? 0) < MIN_TOUCH_CELL
      ) {
        onTooSmall();
        return undefined;
      }

      onPress();
      editor.begin();
      gesture.current = make(at, base);
      return gesture.current;
    },
    finish: () => {
      const current = gesture.current;
      gesture.current = undefined;
      return current;
    },
  };
}
