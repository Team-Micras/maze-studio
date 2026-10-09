import { SidebarSimple, SquaresFour } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

import type { Cell } from '@/maze';
import { MINIMAP_SIZE, type WorldRect } from '@/render';
import { CursorStatus } from '@/ui/board/cursor-status';
import { Minimap } from '@/ui/board/minimap';
import type { CanvasCamera } from '@/ui/board/use-canvas-camera';
import { Hint, Island, IslandButton } from '@/ui/islands/island';
import { ZoomIsland } from '@/ui/islands/zoom-island';
import { zoomPercent } from '@/ui/islands/zoom-percent';
import type { OpenMaze } from '@/ui/open-maze';

/** The minimap's longest side on a phone. */
const PHONE_MINIMAP_SIZE = 108;

/** The id of the quick list, which the Maze list button controls. */
export const MAZE_LIST_ID = 'maze-list';

/** The props of {@link EditorChrome}. */
export interface EditorChromeProps {
  readonly open: OpenMaze;
  /** Where its board lies in the world. */
  readonly board: WorldRect;
  readonly controller: CanvasCamera;
  readonly phone: boolean;
  /** Whether the islands show; they come in late in the flight and leave at once. */
  readonly visible: boolean;
  /**
   * Whether the camera has landed on the board; the minimap, hidden at the fit anyway, waits for
   * it, so the flight's first frame does not also paint it.
   */
  readonly landed: boolean;
  readonly listOpen: boolean;
  readonly onToggleList: () => void;
  readonly onLibrary: () => void;
  /** The keyboard cursor's cell, which the status names on a notebook. */
  readonly cursor?: Cell;
  /** The editing controls at the bottom centre. */
  readonly children?: ReactNode;
}

/**
 * The islands of an open maze (DESIGN.md 9.2 and 9.3): the way back to the library, the quick
 * list and the title at the top left, the minimap at the top right, the zoom at the bottom right,
 * down the right edge on a phone, the cursor's status at the bottom left on a notebook, and the
 * editing controls at the bottom centre.
 */
export function EditorChrome({
  open,
  board,
  controller,
  phone,
  visible,
  landed,
  listOpen,
  onToggleList,
  onLibrary,
  cursor,
  children,
}: EditorChromeProps) {
  return (
    <div
      className="transition-opacity duration-200 ease-(--ease) data-hidden:pointer-events-none data-hidden:opacity-0"
      data-chrome="editor"
      data-hidden={visible ? undefined : ''}
      inert={!visible}
    >
      <header>
        <Island className="fixed top-4 left-4 h-11 max-w-[calc(50vw-40px)] max-[720px]:top-safe-2 max-[720px]:left-safe-2 max-[720px]:max-w-[calc(100vw-16px)]">
          <Hint label="Library" side="bottom">
            <IslandButton aria-label="Back to the library" onClick={onLibrary}>
              <SquaresFour aria-hidden size={18} />
            </IslandButton>
          </Hint>
          <Hint label="Maze list" shortcut="L" side="bottom">
            <IslandButton
              aria-controls={listOpen ? MAZE_LIST_ID : undefined}
              aria-expanded={listOpen}
              aria-label="Maze list"
              onClick={onToggleList}
            >
              <SidebarSimple aria-hidden size={18} />
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
      {landed ? (
        <Minimap
          board={board}
          className="fixed top-[70px] right-4 max-[720px]:top-safe-16 max-[720px]:right-safe-2"
          controller={controller}
          maze={open.maze}
          size={phone ? PHONE_MINIMAP_SIZE : MINIMAP_SIZE}
        />
      ) : null}
      <footer>
        {phone ? null : (
          <CursorStatus cell={cursor} className="fixed bottom-6 left-4 z-[9]" maze={open.maze} />
        )}
        {children}
        <ZoomIsland
          className={
            phone
              ? 'right-safe-2 bottom-[calc(96px+env(safe-area-inset-bottom))]'
              : 'right-4 bottom-[18px]'
          }
          orientation={phone ? 'vertical' : 'horizontal'}
          percent={zoomPercent(controller)}
          refit={controller.refit}
          zoomBy={controller.zoomBy}
        />
      </footer>
    </div>
  );
}
