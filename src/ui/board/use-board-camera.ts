import {
  boardLimits,
  EDITOR_INSETS,
  EDITOR_KEEP,
  EDITOR_ZOOM,
  type Insets,
  type WorldRect,
  type ZoomRange,
} from '@/render';

import { useCanvasCamera, type CanvasCamera } from './use-canvas-camera';

/** What the camera of one board is set up with. */
export interface BoardCameraOptions {
  /** The board, in world units. */
  readonly board: WorldRect;
  /** The room left for the islands around the fitted board; the editor's by default. */
  readonly insets?: Insets;
  /** The zoom range, in multiples of the fit; the editor's by default. */
  readonly zoom?: ZoomRange;
  /** How many pixels of the board stay on screen; the editor's 96 by default. */
  readonly keep?: number;
}

/**
 * The camera of one board: fitted between the insets, zoomed half to ten times the fit, and
 * keeping part of the board on screen (DESIGN.md 7).
 */
export function useBoardCamera({
  board,
  insets = EDITOR_INSETS,
  zoom = EDITOR_ZOOM,
  keep = EDITOR_KEEP,
}: BoardCameraOptions): CanvasCamera {
  return useCanvasCamera({
    content: board,
    limits: (viewport) => boardLimits({ board, viewport, insets, zoom, keep }),
  });
}
