import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';

import { filterCatalog, type CatalogEntry, type LibraryFilter } from '@/library';
import {
  artboardIn,
  boardLimits,
  cellOf,
  constrainCamera,
  EASE_FLIGHT,
  EDITOR_INSETS,
  EDITOR_KEEP,
  EDITOR_PHONE_INSETS,
  EDITOR_ZOOM,
  fitCamera,
  LIBRARY_INSETS,
  libraryColumns,
  libraryGrid,
  libraryLimits,
  revealCamera,
  type Camera,
  type WorldRect,
} from '@/render';
import { useCanvasCamera } from '@/ui/board/use-canvas-camera';
import { usePhoneLayout } from '@/ui/hooks/use-media-query';
import { useViewportWidth } from '@/ui/hooks/use-viewport-width';
import { ZoomIsland } from '@/ui/islands/zoom-island';
import { zoomPercent } from '@/ui/islands/zoom-percent';
import { EmptyLibrary } from '@/ui/library/empty-library';
import { emptyTitle } from '@/ui/library/empty-title';
import { LibraryCanvas } from '@/ui/library/library-canvas';
import { LibraryChrome } from '@/ui/library/library-chrome';
import type { Library } from '@/ui/library/use-library';
import { openEntry, type OpenMaze } from '@/ui/open-maze';
import type { Route } from '@/ui/routes';

import { EditorChrome } from './editor-chrome';
import { listOrder, steppedKey } from './list-order';
import { MazeList } from './maze-list';
import { OpenBoard } from './open-board';
import {
  CHROME_IN_AT,
  createStudioStore,
  FLIGHT_IN_MS,
  FLIGHT_OUT_MS,
  LOOSE_CELL,
  type StudioState,
} from './studio-store';

/** The props of {@link Studio}. */
export interface StudioProps {
  /** The library, or `undefined` while it loads. */
  readonly library: Library | undefined;
  /** The maze the route or an opened file puts on screen, if any. */
  readonly opened: OpenMaze | undefined;
  /** The filter of the library, the last one shown. */
  readonly filter: LibraryFilter;
  readonly onFilter: (filter: LibraryFilter) => void;
  readonly onOpenFile: (file: File) => void;
  /** Leaves the open maze for the library. */
  readonly onLibrary: () => void;
  /** Puts the maze of a catalog entry in the route, in place of the open one. */
  readonly onPin: (route: Route) => void;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function typingIn(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

function routeOf(entry: CatalogEntry): Route {
  return entry.origin === 'mine' && entry.id !== undefined
    ? { kind: 'mine', id: entry.id }
    : { kind: 'repo', path: entry.path ?? entry.name };
}

/** The camera that shows `rect` at the same place on screen as `camera` shows `from`. */
function sameScreenPlace(camera: Camera, from: WorldRect, rect: WorldRect): Camera {
  const k = (camera.k * from.width) / rect.width;
  return {
    k,
    x: camera.x + from.x * camera.k - rect.x * k,
    y: camera.y + from.y * camera.k - rect.y * k,
  };
}

/**
 * The library and the open maze on one canvas (PLAN.md 3.4, DESIGN.md 8). Opening an artboard
 * flies the camera to it in 620 ms while its full board cross-fades over the thumbnail and the
 * other artboards fade out; leaving flies back in 520 ms and lands on the artboard of the maze on
 * screen. A maze opened by its route on a fresh load, from a link or from a file, or with reduced
 * motion, arrives without a flight. The quick list previews mazes in place, on the same board.
 */
export function Studio({
  library,
  opened,
  filter,
  onFilter,
  onOpenFile,
  onLibrary,
  onPin,
}: StudioProps) {
  const [store] = useState(createStudioStore);
  const state: StudioState = useStore(store);
  const phone = usePhoneLayout();
  const viewportWidth = useViewportWidth();
  const layout = phone ? 'phone' : 'notebook';
  const insets = LIBRARY_INSETS[layout];
  const editorInsets = phone ? EDITOR_PHONE_INSETS : EDITOR_INSETS;
  const shown = library === undefined ? [] : filterCatalog(library.entries, filter, library.index);
  const grid = libraryGrid(shown, libraryColumns(viewportWidth, layout));
  const gridRect: WorldRect = { x: 0, y: 0, width: grid.width, height: grid.height };
  const { mode } = state;

  const previewEntry =
    state.preview !== undefined && state.preview !== opened?.key
      ? library?.entries.find((entry) => entry.key === state.preview)
      : undefined;
  const previewMaze = previewEntry === undefined ? undefined : library?.mazeOf(previewEntry.key);
  const onScreen =
    previewEntry !== undefined && previewMaze !== undefined
      ? openEntry(previewEntry, previewMaze)
      : (opened ?? state.leaving);
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
  const latest = useRef({
    camera,
    grid,
    shown,
    insets,
    editorInsets,
    opened,
    onScreen,
    board,
    phone,
  });
  const lastPointer = useRef('mouse');
  const libraryCamera = useRef<Camera | undefined>(undefined);
  const libraryShown = useRef(false);
  const openKey = opened?.key;
  const previousKey = useRef<string | undefined>(undefined);
  const previousShown = useRef<{ onScreen?: OpenMaze; board?: WorldRect }>({});

  useLayoutEffect(() => {
    latest.current = { camera, grid, shown, insets, editorInsets, opened, onScreen, board, phone };
  });

  useEffect(() => {
    if (mode === 'library' && library !== undefined && camera.camera !== undefined) {
      libraryShown.current = true;
      libraryCamera.current = camera.camera;
    }
  }, [mode, library, camera.camera]);

  useLayoutEffect(() => {
    const before = previousKey.current;
    previousKey.current = openKey;
    const now = latest.current;
    const view = now.camera.limits?.viewport;
    const from = now.camera.camera;

    if (openKey === before) {
      return;
    }

    if (openKey !== undefined && before === undefined && now.opened !== undefined) {
      const index = now.shown.findIndex((entry) => entry.key === openKey);
      const cell = index < 0 ? LOOSE_CELL : cellOf(index, now.grid.columns);
      const rect = artboardIn(cell, now.opened.maze);
      const flies =
        index >= 0 &&
        libraryShown.current &&
        store.getState().mode === 'library' &&
        view !== undefined &&
        !prefersReducedMotion();
      store.setState({
        cell,
        viewing: now.phone || lastPointer.current === 'touch',
        libraryZoom: from?.k,
        leaving: undefined,
        preview: undefined,
        chromeIn: false,
        mode: flies ? 'flying-in' : 'editor',
      });
      now.camera.fly({
        to:
          view === undefined
            ? (from ?? { x: 0, y: 0, k: 1 })
            : fitCamera(rect, view, now.editorInsets),
        anchor: rect,
        duration: flies ? FLIGHT_IN_MS : 0,
        easing: EASE_FLIGHT,
        land: 'fit',
        onProgress: (progress) => {
          if (progress >= CHROME_IN_AT && !store.getState().chromeIn) {
            store.setState({ chromeIn: true });
          }
        },
        onLand: () => {
          store.setState({ mode: 'editor', chromeIn: true });
          now.camera.element?.focus({ preventScroll: true });
        },
      });
      return;
    }

    if (openKey === undefined && before !== undefined) {
      const leaving = previousShown.current.onScreen;
      const leftBoard = previousShown.current.board;
      const index = now.shown.findIndex((entry) => entry.key === leaving?.key);
      const back =
        index < 0 || leaving === undefined
          ? undefined
          : artboardIn(cellOf(index, now.grid.columns), leaving.maze);
      const libraryLanding =
        view === undefined
          ? undefined
          : constrainCamera(
              back === undefined
                ? (libraryCamera.current ?? libraryLimits(now.grid, view, now.insets).fit)
                : revealCamera(
                    libraryCamera.current ?? libraryLimits(now.grid, view, now.insets).fit,
                    back,
                    view,
                    now.insets
                  ),
              libraryLimits(now.grid, view, now.insets)
            );
      const start =
        back === undefined || leftBoard === undefined || from === undefined
          ? undefined
          : sameScreenPlace(from, leftBoard, back);
      const flies =
        start !== undefined &&
        libraryLanding !== undefined &&
        store.getState().mode === 'editor' &&
        !prefersReducedMotion();

      if (flies) {
        now.camera.jump(start);
      }

      store.setState({
        mode: flies ? 'flying-out' : 'library',
        cell: back === undefined ? store.getState().cell : cellOf(index, now.grid.columns),
        leaving: flies ? leaving : undefined,
        preview: undefined,
        listOpen: false,
        chromeIn: false,
      });
      now.camera.fly({
        to: libraryLanding ?? from ?? { x: 0, y: 0, k: 1 },
        anchor: back ?? leftBoard ?? { x: 0, y: 0, width: 1, height: 1 },
        duration: flies ? FLIGHT_OUT_MS : 0,
        easing: EASE_FLIGHT,
        land: libraryLanding === undefined ? 'fit' : 'keep',
        onLand: () => {
          store.setState({ mode: 'library', leaving: undefined });
          document
            .querySelector<HTMLElement>(`a[data-artboard="${CSS.escape(leaving?.key ?? '')}"]`)
            ?.focus({ preventScroll: true });
        },
      });
    }
  }, [openKey, store]);

  useLayoutEffect(() => {
    previousShown.current = { onScreen, board };
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
        store.setState({ listOpen: true });
      } else if (event.key === '[' || event.key === ']') {
        event.preventDefault();
        const keys = listOrder(library.entries).map((entry) => entry.key);
        const next = steppedKey(keys, latest.current.onScreen?.key, event.key === ']' ? 1 : -1);
        const entry = library.entries.find((candidate) => candidate.key === next);

        if (entry !== undefined) {
          onPin(routeOf(entry));
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, library, store, onPin]);

  const libraryVisible = mode === 'library' || mode === 'flying-out';
  const editorVisible = mode === 'editor' || (mode === 'flying-in' && state.chromeIn);
  const primaryPan =
    mode === 'library' ? 'lazy' : mode === 'editor' && state.viewing ? 'on' : 'off';
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
            bandScale={libraryVisible ? undefined : state.libraryZoom}
            className="fixed inset-0"
            controller={camera}
            entries={shown}
            grid={grid}
            insets={insets}
            label={
              inEditor && onScreen !== undefined ? `${onScreen.name}, maze board` : 'Maze library'
            }
            library={library}
            onArtboardPointer={(pointerType) => {
              lastPointer.current = pointerType;
            }}
            othersHidden={!libraryVisible}
            primaryPan={primaryPan}
          >
            {mode !== 'library' && onScreen !== undefined && board !== undefined ? (
              <OpenBoard maze={onScreen.maze} rect={board} shown={mode !== 'flying-out'} />
            ) : null}
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
      {onScreen !== undefined && board !== undefined && mode !== 'library' ? (
        <EditorChrome
          board={board}
          controller={camera}
          landed={mode === 'editor'}
          listOpen={state.listOpen}
          onLibrary={onLibrary}
          onToggleList={() => store.setState({ listOpen: !state.listOpen, preview: undefined })}
          open={onScreen}
          phone={phone}
          visible={editorVisible}
        />
      ) : null}
      {state.listOpen && library !== undefined && mode === 'editor' ? (
        <MazeList
          current={onScreen?.key}
          library={library}
          onCancel={() => {
            store.setState({ listOpen: false, preview: undefined });
            camera.element?.focus({ preventScroll: true });
          }}
          onPin={(key) => {
            pinKey(key);
            camera.element?.focus({ preventScroll: true });
          }}
          onPreview={(key) => store.setState({ preview: key })}
          phone={phone}
        />
      ) : null}
    </div>
  );
}
