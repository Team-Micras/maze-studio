import { SquaresFour } from '@phosphor-icons/react';

import { boardGeometry } from '@/render';
import { Board } from '@/ui/board/board';
import { CameraStage } from '@/ui/board/camera-stage';
import { useBoardCamera } from '@/ui/board/use-board-camera';
import { Hint, Island, IslandButton } from '@/ui/islands/island';
import { ZoomIsland } from '@/ui/islands/zoom-island';
import { zoomPercent } from '@/ui/islands/zoom-percent';
import type { OpenMaze } from '@/ui/open-maze';

/** The props of {@link MazeScreen}. */
export interface MazeScreenProps {
  readonly open: OpenMaze;
  readonly onLibrary: () => void;
}

/**
 * A maze open to look at: the board on its canvas, the title island with the way back to the
 * library, and the zoom. Editing, the flight and the maze list come in later slices.
 */
export function MazeScreen({ open, onLibrary }: MazeScreenProps) {
  const geometry = boardGeometry(open.maze);
  const camera = useBoardCamera({
    board: { x: 0, y: 0, width: geometry.width, height: geometry.height },
  });

  return (
    <>
      <main>
        <CameraStage
          className="fixed inset-0"
          controller={camera}
          label={`${open.name}, maze board`}
        >
          <Board maze={open.maze} />
        </CameraStage>
      </main>
      <header>
        <Island className="fixed top-4 left-4 h-11 max-w-[calc(50vw-40px)] max-[720px]:top-2 max-[720px]:left-2 max-[720px]:max-w-[calc(100vw-16px)]">
          <Hint label="Library" side="bottom">
            <IslandButton aria-label="Back to the library" onClick={onLibrary}>
              <SquaresFour aria-hidden size={18} />
            </IslandButton>
          </Hint>
          <div className="flex min-w-0 flex-col pr-2 pl-1">
            <h1 className="truncate text-[13px] leading-[18px] font-semibold" translate="no">
              {open.name}
            </h1>
            <p className="truncate text-[11px] leading-[14px] text-muted-foreground">
              {open.detail}
            </p>
          </div>
        </Island>
      </header>
      <footer>
        <ZoomIsland
          className="right-4 bottom-[18px] max-[720px]:right-2 max-[720px]:bottom-3"
          percent={zoomPercent(camera)}
          refit={camera.refit}
          zoomBy={camera.zoomBy}
        />
      </footer>
    </>
  );
}
