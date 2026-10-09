/**
 * A board on its camera stage with the minimap and the cursor status, mounted alone without the
 * shell, as the browser tests of slice 3 need it.
 *
 * @module
 */

import type { Maze } from '@/maze';
import { boardGeometry, type BoardOverlays, type Insets } from '@/render';
import { Board } from '@/ui/board/board';
import { CameraStage } from '@/ui/board/camera-stage';
import { CursorStatus } from '@/ui/board/cursor-status';
import { Minimap } from '@/ui/board/minimap';
import { useBoardCamera } from '@/ui/board/use-board-camera';

/** The props of {@link BoardHarness}. */
export interface BoardHarnessProps {
  readonly maze: Maze;
  readonly overlays?: BoardOverlays;
  readonly insets?: Insets;
  /** The stage's size in CSS pixels; the whole viewport by default. */
  readonly size?: { readonly width: number; readonly height: number };
  /** Whether to show the cursor status, text that screenshots leave out; shown by default. */
  readonly status?: boolean;
}

/** The board, the camera stage, the minimap and the cursor status. */
export function BoardHarness({ maze, overlays, insets, size, status = true }: BoardHarnessProps) {
  const geometry = boardGeometry(maze);
  const board = { x: 0, y: 0, width: geometry.width, height: geometry.height };
  const camera = useBoardCamera({ board, insets });

  return (
    <div
      className="relative"
      data-testid="harness"
      style={size === undefined ? { position: 'fixed', inset: 0 } : size}
    >
      <CameraStage className="absolute inset-0" controller={camera} label="Maze board">
        <Board maze={maze} overlays={overlays} />
      </CameraStage>
      <Minimap board={board} className="top-[70px] right-4" controller={camera} maze={maze} />
      {status && (
        <CursorStatus cell={overlays?.cursor} className="absolute bottom-4 left-4" maze={maze} />
      )}
    </div>
  );
}
