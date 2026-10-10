import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';

import { filterCatalog, type CatalogEntry, type LibraryFilter } from '@/library';
import {
  artboardIn,
  boardLimits,
  cellOf,
  EDITOR_INSETS,
  EDITOR_KEEP,
  EDITOR_PHONE_EDIT_INSETS,
  EDITOR_PHONE_INSETS,
  EDITOR_ZOOM,
  LIBRARY_INSETS,
  libraryColumns,
  libraryGrid,
  libraryLimits,
  type Insets,
  type WorldRect,
} from '@/render';
import { useCanvasCamera } from '@/ui/board/use-canvas-camera';
import { ChangesChip, ChangesPanel } from '@/ui/changes/changes';
import type { ChangeItem } from '@/ui/changes/session-changes';
import { Checks } from '@/ui/editor/checks';
import { EditControls } from '@/ui/editor/edit-controls';
import { MoreActions } from '@/ui/editor/more-actions';
import { ShortcutHelp } from '@/ui/editor/shortcut-help';
import type { MazeEditor } from '@/ui/editor/use-maze-editor';
import { useCoarsePointer, usePhoneLayout } from '@/ui/hooks/use-media-query';
import { useViewportWidth } from '@/ui/hooks/use-viewport-width';
import { ZoomIsland } from '@/ui/islands/zoom-island';
import { zoomPercent } from '@/ui/islands/zoom-percent';
import { EmptyLibrary } from '@/ui/library/empty-library';
import { emptyTitle } from '@/ui/library/empty-title';
import { LibraryCanvas } from '@/ui/library/library-canvas';
import { LibraryChrome } from '@/ui/library/library-chrome';
import type { Library } from '@/ui/library/use-library';
import { openEntry, type OpenMaze } from '@/ui/open-maze';
import { cn } from '@/ui/primitives/utils';
import type { NewMazeRequest } from '@/ui/new-maze';
import type { Route } from '@/ui/routes';
import { typingIn } from '@/ui/typing-in';

import { EditorChrome } from './editor-chrome';
import { listOrder, steppedKey } from './list-order';
import { MazeList } from './maze-list';
import { OpenBoard } from './open-board';
import { useStudioChanges } from './use-studio-changes';
import { useStudioEditing } from './use-studio-editing';
import { useStudioFlight } from './use-studio-flight';
import { createStudioStore, type StudioState } from './studio-store';

/** The props of {@link Studio}. */
export interface StudioProps {
  /** The library, or `undefined` while it loads. */
  readonly library: Library | undefined;
  /** The maze the route or an opened file puts on screen, if any, as edited. */
  readonly opened: OpenMaze | undefined;
  /** The editing of the maze on screen. */
  readonly editor: MazeEditor;
  /** The filter of the library, the last one shown. */
  readonly filter: LibraryFilter;
  readonly onFilter: (filter: LibraryFilter) => void;
  readonly onOpenFile: (file: File) => void;
  /** Opens a new maze in the editor. */
  readonly onNew: (request: NewMazeRequest) => void;
  /** The name a new maze gets unless named. */
  readonly newName: string;
  /** Discards an item of Changes: deletes a copy or puts back a maze of Mine. */
  readonly onDiscard: (item: ChangeItem) => void;
  /** Leaves the open maze for the library. */
  readonly onLibrary: () => void;
  /** Puts the maze of a catalog entry in the route, in place of the open one. */
  readonly onPin: (route: Route) => void;
}

/**
 * The editor's insets (DESIGN.md 7): on a phone, 84 px under the board for the tools in edit mode
 * and 88 px for the Edit button in view mode.
 */
function editorInsetsFor(phone: boolean, viewing: boolean): Insets {
  if (!phone) {
    return EDITOR_INSETS;
  }

  return viewing ? EDITOR_PHONE_INSETS : EDITOR_PHONE_EDIT_INSETS;
}

function routeOf(entry: CatalogEntry): Route {
  return entry.origin === 'mine' && entry.id !== undefined
    ? { kind: 'mine', id: entry.id }
    : { kind: 'repo', path: entry.path ?? entry.name };
}

/**
 * The library and the open maze on one canvas (PLAN.md 3.4, DESIGN.md 8). Opening an artboard
 * flies the camera to it in 620 ms while its full board cross-fades over the thumbnail and the
 * other artboards fade out; leaving flies back in 520 ms and lands on the artboard of the maze on
 * screen. A maze opened by its route on a fresh load, from a link or from a file, or with reduced
 * motion, arrives without a flight. The quick list previews mazes in place, on the same board. An
 * open maze is edited in place (PLAN.md 3.4): the wall tool draws, the arrows move a cell cursor,
 * and a phone, or a maze opened by touch, opens to look at until Edit.
 */
export function Studio({
  library,
  opened,
  editor,
  filter,
  onFilter,
  onOpenFile,
  onNew,
  newName,
  onDiscard,
  onLibrary,
  onPin,
}: StudioProps) {
  const [store] = useState(createStudioStore);
  const state: StudioState = useStore(store);
  const phone = usePhoneLayout();
  const viewportWidth = useViewportWidth();
  const layout = phone ? 'phone' : 'notebook';
  const insets = LIBRARY_INSETS[layout];
  const editorInsets = editorInsetsFor(phone, state.viewing);
  const shown = library === undefined ? [] : filterCatalog(library.entries, filter, library.index);
  const grid = libraryGrid(shown, libraryColumns(viewportWidth, layout));
  const gridRect: WorldRect = { x: 0, y: 0, width: grid.width, height: grid.height };
  const { mode } = state;

  const previewEntry =
    state.preview !== undefined && state.preview !== opened?.key
      ? library?.entries.find((entry) => entry.key === state.preview)
      : undefined;
  const previewed =
    previewEntry === undefined || library === undefined
      ? undefined
      : openEntry(previewEntry, library);
  const onScreen = previewed ?? opened ?? state.leaving;
  const board = onScreen === undefined ? undefined : artboardIn(state.cell, onScreen.maze);
  const inEditor = mode === 'editor' && board !== undefined;

  const camera = useCanvasCamera({
    content: inEditor ? board : gridRect,
    limits: (viewport) =>
      inEditor
        ? boardLimits({
            board,
            viewport,
            insets: editorInsets,
            zoom: EDITOR_ZOOM,
            keep: EDITOR_KEEP,
          })
        : libraryLimits(grid, viewport, insets),
  });
  const coarse = useCoarsePointer();
  const changes = useStudioChanges({ store, state, library, onScreen, phone, onDiscard });
  const editing = useStudioEditing({
    store,
    state,
    editor,
    camera,
    onScreen,
    previewing: previewed !== undefined,
    board,
    insets: editorInsets,
    phone,
    coarse,
    diff: mode === 'editor' ? changes.diff : undefined,
    onToggleDiff: changes.toggleDiff,
    onChanges: changes.openPanel,
  });

  const onScreenKey = useRef(onScreen?.key);
  const listOpener = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    onScreenKey.current = onScreen?.key;
  });

  const openList = useCallback(() => {
    listOpener.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    store.setState({ listOpen: true, preview: undefined });
  }, [store]);

  const closeList = (): void => {
    (listOpener.current ?? camera.element)?.focus({ preventScroll: true });
    listOpener.current = null;
  };

  const preparedIndex =
    mode === 'library' && state.prepared !== undefined
      ? shown.findIndex((entry) => entry.key === state.prepared)
      : -1;
  const preparedMaze =
    preparedIndex < 0 || state.prepared === undefined ? undefined : library?.mazeOf(state.prepared);
  const prepared =
    preparedMaze === undefined || state.prepared === undefined
      ? undefined
      : {
          key: state.prepared,
          maze: preparedMaze,
          rect: artboardIn(cellOf(preparedIndex, grid.columns), preparedMaze),
        };

  const { notePointer } = useStudioFlight({
    store,
    camera,
    grid,
    shown,
    insets,
    editorInsetsFor: (viewing: boolean) => editorInsetsFor(phone, viewing),
    opened,
    onScreen,
    board,
    phone,
    mode,
    libraryLoaded: library !== undefined,
  });

  const pinKey = (key: string): void => {
    const entry = library?.entries.find((candidate) => candidate.key === key);
    store.setState({ listOpen: false });

    if (entry !== undefined) {
      onPin(routeOf(entry));
    }

    store.setState({ preview: undefined });
  };

  useEffect(() => {
    if (mode !== 'editor' || library === undefined) {
      return undefined;
    }

    const onKey = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey || typingIn(event.target)) {
        return;
      }

      if (event.key === 'l' || event.key === 'L') {
        event.preventDefault();
        openList();
      } else if (event.key === '[' || event.key === ']') {
        event.preventDefault();
        const keys = listOrder(library.entries).map((entry) => entry.key);
        const next = steppedKey(keys, onScreenKey.current, event.key === ']' ? 1 : -1);
        const entry = library.entries.find((candidate) => candidate.key === next);

        if (entry !== undefined) {
          onPin(routeOf(entry));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, library, onPin, openList]);

  const libraryVisible = mode === 'library' || mode === 'flying-out';
  const flying = mode === 'flying-in' || mode === 'flying-out';
  const chromeMounted = useDeferredValue(mode !== 'library', false);
  const editorVisible = mode === 'editor' || (mode === 'flying-in' && state.chromeIn);
  const primaryPan =
    mode === 'library'
      ? 'lazy'
      : mode === 'editor' && (state.viewing || state.tool === 'hand')
        ? 'on'
        : 'off';
  const { refit, zoomBy } = camera;
  const changeFilter = useCallback(
    (next: LibraryFilter): void => {
      onFilter(next);
      refit({ animate: true });
    },
    [onFilter, refit]
  );

  return (
    <div data-studio-mode={mode} data-viewing={mode === 'editor' && state.viewing ? '' : undefined}>
      <main>
        {library === undefined ? null : (
          <LibraryCanvas
            activeHidden={mode === 'editor'}
            activeKey={mode === 'library' ? undefined : (state.leaving?.key ?? opened?.key)}
            bandScale={mode === 'library' ? undefined : state.libraryZoom}
            className={cn(
              'fixed inset-0',
              editing.drawingTool && 'cursor-crosshair',
              mode === 'editor' && !state.viewing && state.tool === 'hand' && 'cursor-grab'
            )}
            controller={camera}
            drawing={editing.drawing}
            entries={shown}
            grid={grid}
            insets={insets}
            label={
              inEditor && onScreen !== undefined ? `${onScreen.name}, maze board` : 'Maze library'
            }
            library={library}
            onArtboardPointer={(pointerType, key) => {
              notePointer(pointerType);

              if (mode === 'library' && key !== state.prepared) {
                store.setState({ prepared: key });
              }
            }}
            onCanvasKey={editing.onCanvasKey}
            othersHidden={!libraryVisible}
            primaryPan={primaryPan}
            {...(flying && state.libraryZoom !== undefined
              ? { fixedScale: state.libraryZoom }
              : {})}
            promoted={flying}
          >
            {mode !== 'library' && onScreen !== undefined && board !== undefined ? (
              <OpenBoard
                maze={onScreen.maze}
                overlays={mode === 'editor' ? editing.overlays : undefined}
                rect={board}
                shown={mode !== 'flying-out'}
              />
            ) : prepared === undefined ? null : (
              <OpenBoard maze={prepared.maze} rect={prepared.rect} shown={false} />
            )}
          </LibraryCanvas>
        )}
        {library !== undefined && mode === 'library' && shown.length === 0 ? (
          <EmptyLibrary mineIsEmpty={filter.source === 'mine' && library.mineCount === 0} />
        ) : null}
        <p aria-live="polite" className="sr-only">
          {library !== undefined && mode === 'library' && shown.length === 0
            ? emptyTitle(filter.source === 'mine' && library.mineCount === 0)
            : ''}
        </p>
      </main>
      <LibraryChrome
        filter={filter}
        library={library}
        onFilter={changeFilter}
        changes={libraryVisible ? <ChangesChip {...changes.chip} /> : null}
        newName={newName}
        onNew={onNew}
        onOpenFile={onOpenFile}
        phone={phone}
        visible={libraryVisible}
      />
      {phone ? null : (
        <aside
          aria-label="Zoom"
          className="transition-opacity duration-200 ease-(--ease) data-hidden:pointer-events-none data-hidden:opacity-0"
          data-hidden={libraryVisible ? undefined : ''}
          inert={!libraryVisible}
        >
          <ZoomIsland
            className="right-4 bottom-[18px]"
            percent={zoomPercent(camera)}
            refit={refit}
            zoomBy={zoomBy}
          />
        </aside>
      )}
      {chromeMounted && onScreen !== undefined && board !== undefined && mode !== 'library' ? (
        <EditorChrome
          board={board}
          controller={camera}
          actions={
            editing.checks === undefined ? null : (
              <>
                <ChangesChip {...changes.chip} />
                <Checks {...editing.checks} />
                <MoreActions {...editing.actions} />
              </>
            )
          }
          cursor={editing.cursor}
          landed={mode === 'editor'}
          listOpen={state.listOpen}
          onLibrary={onLibrary}
          onToggleList={() => {
            if (state.listOpen) {
              store.setState({ listOpen: false, preview: undefined });
              closeList();
            } else {
              openList();
            }
          }}
          open={onScreen}
          phone={phone}
          visible={editorVisible}
        >
          <EditControls {...editing.controls} />
        </EditorChrome>
      ) : null}
      {mode === 'editor' && !coarse ? <ShortcutHelp {...editing.help} /> : null}
      {mode === 'library' || mode === 'editor' ? <ChangesPanel {...changes.panel} /> : null}
      {state.listOpen && library !== undefined && mode === 'editor' ? (
        <MazeList
          current={onScreen?.key}
          library={library}
          onCancel={() => {
            store.setState({ listOpen: false, preview: undefined });
            closeList();
          }}
          onPin={(key) => {
            pinKey(key);
            closeList();
          }}
          onPreview={(key) => store.setState({ preview: key })}
          phone={phone}
        />
      ) : null}
    </div>
  );
}
