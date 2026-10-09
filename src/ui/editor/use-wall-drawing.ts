import { useEffect, useRef, useState } from 'react';

import { hasWall, type Edge, type Maze } from '@/maze';
import {
  applyStroke,
  beginStroke,
  boardGeometry,
  cellOnScreen,
  extendStroke,
  MIN_TOUCH_CELL,
  mazePointAt,
  nearestEdge,
  toWorld,
  type EdgePreview,
  type MazePoint,
  type ScreenPoint,
  type Stroke,
  type WorldRect,
} from '@/render';
import type { DrawInput, StageDrawing } from '@/ui/board/camera-stage';
import type { CanvasCamera } from '@/ui/board/use-canvas-camera';

import type { MazeEditor } from './use-maze-editor';

/** What the wall tool draws on. */
export interface WallDrawingInput {
  readonly editor: MazeEditor;
  readonly camera: CanvasCamera;
  /** The maze on screen, if any. */
  readonly maze: Maze | undefined;
  /** Where its board lies in the world. */
  readonly board: WorldRect | undefined;
  /** Whether the wall tool draws now. */
  readonly enabled: boolean;
  /** Called when a touch lands on cells too small to edit by touch. */
  readonly onTooSmall: () => void;
  /** Called when a gesture starts, which hides the keyboard cursor. */
  readonly onPress: () => void;
}

/** The wall tool's gestures for the stage, and the edge it previews. */
export interface WallDrawing {
  readonly drawing: StageDrawing | undefined;
  readonly preview: EdgePreview | undefined;
}

interface Gesture {
  /** The maze before the gesture. */
  readonly base: Maze;
  readonly touch: boolean;
  /** The stroke, once the pointer has touched an edge. */
  stroke: Stroke | undefined;
  /** Whether the stroke is on the board yet; a touch waits for a step or its release. */
  applied: boolean;
}

function sameEdge(left: Edge | undefined, right: Edge | undefined): boolean {
  return left?.direction === right?.direction && left?.x === right?.x && left?.y === right?.y;
}

/**
 * The wall tool (PLAN.md 3.4, DESIGN.md 10): a click or a tap toggles the nearest wall slot, and a
 * drag paints or erases along the grid of posts, turning at any post, as one step of undo. Shift,
 * read at every move, keeps the stroke on its axis. A mouse previews the slot under it; a finger
 * previews the slot it pressed and changes it only on release or once the stroke steps on, so a
 * second finger that starts a pinch leaves nothing behind. A touch on cells under 28 px does not
 * edit.
 */
export function useWallDrawing({
  editor,
  camera,
  maze,
  board,
  enabled,
  onTooSmall,
  onPress,
}: WallDrawingInput): WallDrawing {
  const [preview, setPreview] = useState<EdgePreview | undefined>(undefined);
  const gesture = useRef<Gesture | undefined>(undefined);
  const active = enabled && maze !== undefined && board !== undefined;

  useEffect(() => {
    if (!active && gesture.current !== undefined) {
      gesture.current = undefined;
      editor.end();
    }
  });

  if (!active) {
    return { drawing: undefined, preview: undefined };
  }

  const geometry = boardGeometry(maze);

  const mazePoint = (point: ScreenPoint): MazePoint | undefined => {
    const view = camera.camera;
    return view === undefined ? undefined : mazePointAt(geometry, board, toWorld(view, point));
  };

  const showPreview = (next: EdgePreview | undefined): void => {
    setPreview((before) =>
      sameEdge(before?.edge, next?.edge) && before?.removes === next?.removes ? before : next
    );
  };

  const apply = (current: Gesture): void => {
    if (current.stroke !== undefined) {
      current.applied = true;
      editor.change(applyStroke(current.base, current.stroke));
    }
  };

  const reach = (current: Gesture, point: MazePoint, lockAxis: boolean): void => {
    if (current.stroke === undefined) {
      const edge = nearestEdge(maze, point);
      current.stroke = edge === undefined ? undefined : beginStroke(current.base, edge, point);
      return;
    }

    current.stroke = extendStroke(maze, current.stroke, point, { lockAxis });
  };

  const begin = (point: ScreenPoint, input: DrawInput): boolean => {
    const at = mazePoint(point);
    const base = editor.current();
    const touch = input.pointerType === 'touch';

    if (at === undefined || base === undefined) {
      return false;
    }

    if (touch && cellOnScreen(geometry, board, camera.camera?.k ?? 0) < MIN_TOUCH_CELL) {
      onTooSmall();
      return false;
    }

    onPress();
    editor.begin();
    const current: Gesture = { base, touch, stroke: undefined, applied: false };
    gesture.current = current;
    reach(current, at, input.shiftKey);

    if (touch) {
      const edge = current.stroke?.edges[0];
      showPreview(edge === undefined ? undefined : { edge, removes: hasWall(base, edge) });
    } else {
      showPreview(undefined);
      apply(current);
    }

    return true;
  };

  const move = (points: readonly ScreenPoint[], input: DrawInput): void => {
    const current = gesture.current;

    if (current === undefined) {
      return;
    }

    const before = current.stroke;

    for (const point of points) {
      const at = mazePoint(point);

      if (at !== undefined) {
        reach(current, at, input.shiftKey);
      }
    }

    if (current.stroke !== before) {
      showPreview(undefined);
      apply(current);
    }
  };

  const end = (): void => {
    const current = gesture.current;
    gesture.current = undefined;

    if (current !== undefined && !current.applied) {
      apply(current);
    }

    showPreview(undefined);
    editor.end();
  };

  const cancel = (): void => {
    gesture.current = undefined;
    showPreview(undefined);
    editor.cancel();
  };

  const hover = (point: ScreenPoint | undefined): void => {
    const at = point === undefined ? undefined : mazePoint(point);
    const edge = at === undefined ? undefined : nearestEdge(maze, at);
    showPreview(edge === undefined ? undefined : { edge, removes: hasWall(maze, edge) });
  };

  return { drawing: { begin, move, end, cancel, hover }, preview };
}
