import { SidebarSimple, SquaresFour } from '@/ui/icons';
import { useDeferredValue, type ReactNode } from 'react';

import type { Cell } from '@/maze';
import { MINIMAP_SIZE, zoomOf, type WorldRect } from '@/render';
import { CursorStatus } from '@/ui/board/cursor-status';
import { Minimap } from '@/ui/board/minimap';
import type { CanvasCamera } from '@/ui/board/use-canvas-camera';
import { Hint, Island, IslandButton } from '@/ui/islands/island';
import { ZoomIsland } from '@/ui/islands/zoom-island';
import type { OpenMaze } from '@/ui/open-maze';

/** The camera's zoom as a whole percentage of the fit; 100 before the camera is measured. */
function zoomPercent({ camera, limits }: Pick<CanvasCamera, 'camera' | 'limits'>): number {
  return camera === undefined || limits === undefined
    ? 100
    : Math.round(zoomOf(camera, limits) * 100);
}

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
   * Whether the camera has landed on the board; the minimap, the checks and menu, and the editing
   * controls wait for it, mount in a deferred render that React splits across frames, and fade in,
   * so neither the flight nor its landing frame pays for them.
   */
  readonly landed: boolean;
  readonly listOpen: boolean;
  readonly onToggleList: () => void;
  readonly onLibrary: () => void;
  /** The keyboard cursor's cell, which the status names on a notebook. */
  readonly cursor?: Cell;
  /** The editing controls at the bottom centre. */
  readonly children?: ReactNode;
  /** The checks and the menu, in the island at the top right. */
  readonly actions?: ReactNode;
  /** Save to folder, after the title. */
  readonly titleActions?: ReactNode;
  /** Opens Rename from the title, for a maze of My mazes or a new maze; without it the title is plain. */
  readonly onRename?: (() => void) | undefined;
}

/**
 * The islands of an open maze (DESIGN.md 9.2 and 9.3): the way back to the library, the quick
 * list and the title at the top left, the checks and the menu at the top right, the minimap at the top right, the zoom at the bottom right,
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
  actions,
  titleActions,
  onRename,
}: EditorChromeProps) {
  const settled = useDeferredValue(landed, false) && landed;

  return (
    <div
      className="transition-opacity duration-200 ease-(--ease) data-hidden:pointer-events-none data-hidden:opacity-0"
      data-chrome="editor"
      data-hidden={visible ? undefined : ''}
      inert={!visible}
    >
      <header className="max-[720px]:pointer-events-none max-[720px]:fixed max-[720px]:top-safe-2 max-[720px]:right-safe-2 max-[720px]:left-safe-2 max-[720px]:z-10 max-[720px]:flex max-[720px]:gap-2">
        <Island className="fixed top-safe-4 left-safe-4 h-11 max-w-[calc(50vw-40px)] max-[720px]:pointer-events-auto max-[720px]:static max-[720px]:min-w-0 max-[720px]:max-w-none">
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
            <h1 className="min-w-0 text-[13px] leading-[18px] font-semibold" translate="no">
              {onRename === undefined ? (
                <span className="block truncate">{open.name}</span>
              ) : (
                <button
                  aria-haspopup="dialog"
                  className="relative -mx-1 block max-w-full rounded-[6px] px-1 text-left outline-none after:absolute after:inset-x-0 after:-inset-y-[13px] after:content-[''] hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  onClick={onRename}
                  type="button"
                >
                  <span className="block truncate">{open.name}</span>
                </button>
              )}
            </h1>
            <p className="truncate text-[11px] leading-[14px] text-muted-foreground">
              {open.detail}
            </p>
          </div>
          {settled ? titleActions : null}
        </Island>
        {!settled || actions === undefined || actions === null ? null : (
          <Island className="fixed top-safe-4 right-safe-4 h-11 transition-opacity duration-200 ease-(--ease) starting:opacity-0 max-[720px]:pointer-events-auto max-[720px]:static max-[720px]:ml-auto max-[720px]:shrink-0">
            {actions}
          </Island>
        )}
      </header>
      {settled ? (
        <Minimap
          board={board}
          className="fixed top-safe-[70px] right-safe-4 max-[720px]:top-safe-16 max-[720px]:right-safe-2"
          controller={controller}
          maze={open.maze}
          size={phone ? PHONE_MINIMAP_SIZE : MINIMAP_SIZE}
        />
      ) : null}
      <footer>
        {phone ? null : (
          <CursorStatus
            cell={cursor}
            className="fixed bottom-safe-6 left-safe-4 z-[9]"
            maze={open.maze}
          />
        )}
        {settled ? (
          <div className="transition-opacity duration-200 ease-(--ease) starting:opacity-0">
            {children}
          </div>
        ) : null}
        <ZoomIsland
          className={
            phone
              ? 'right-safe-2 bottom-[calc(96px+env(safe-area-inset-bottom))]'
              : 'right-safe-4 bottom-safe-[18px]'
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
