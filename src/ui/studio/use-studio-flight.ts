import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { StoreApi } from 'zustand';

import type { CatalogEntry } from '@/library';
import {
  artboardIn,
  cellOf,
  constrainCamera,
  EASE_FLIGHT,
  fitCamera,
  libraryLimits,
  revealCamera,
  type Camera,
  type Insets,
  type LibraryGrid,
  type WorldRect,
} from '@/render';
import type { CanvasCamera } from '@/ui/board/use-canvas-camera';
import type { OpenMaze } from '@/ui/open-maze';

import {
  CHROME_IN_AT,
  FLIGHT_IN_MS,
  FLIGHT_OUT_MS,
  LOOSE_CELL,
  type StudioMode,
  type StudioState,
} from './studio-store';

/** What the studio's flights depend on, as of the current render. */
export interface StudioFlightInput {
  readonly store: StoreApi<StudioState>;
  readonly camera: CanvasCamera;
  readonly grid: LibraryGrid;
  /** The entries of the library's grid, in order. */
  readonly shown: readonly CatalogEntry[];
  readonly insets: Insets;
  /** The editor's insets in view mode or in edit mode. */
  readonly editorInsetsFor: (viewing: boolean) => Insets;
  /** The maze the route or a file opens. */
  readonly opened: OpenMaze | undefined;
  /** The maze on the board, a preview included. */
  readonly onScreen: OpenMaze | undefined;
  /** Where that board lies. */
  readonly board: WorldRect | undefined;
  readonly phone: boolean;
  readonly mode: StudioMode;
  readonly libraryLoaded: boolean;
}

/** What the studio hands the flights. */
export interface StudioFlight {
  /** Notes the kind of pointer that pressed an artboard, which decides view mode. */
  readonly notePointer: (pointerType: string) => void;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
 * The flights between the library and a maze (DESIGN.md 8), driven by the route: when it opens a
 * maze, the camera flies 620 ms to the board in the cell of its artboard, or arrives at once when
 * there is no artboard, the library was never shown, or motion is reduced; when it leaves, the
 * camera flies 520 ms back from where the board is on screen to the artboard of the maze on it.
 */
export function useStudioFlight(input: StudioFlightInput): StudioFlight {
  const { store, camera, opened, onScreen, board, mode, libraryLoaded } = input;
  const latest = useRef(input);
  const lastPointer = useRef('mouse');
  const libraryCamera = useRef<Camera | undefined>(undefined);
  const libraryShown = useRef(false);
  const openKey = opened?.key;
  const previousKey = useRef<string | undefined>(undefined);
  const previousShown = useRef<{ onScreen?: OpenMaze; board?: WorldRect; camera?: Camera }>({});

  useLayoutEffect(() => {
    latest.current = input;
  });

  useEffect(() => {
    if (mode === 'library' && libraryLoaded && camera.camera !== undefined) {
      libraryShown.current = true;
      libraryCamera.current = camera.camera;
    }
  }, [mode, libraryLoaded, camera.camera]);

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
      const viewing = now.phone || lastPointer.current === 'touch';
      store.setState({
        cell,
        viewing,
        touchOpened: lastPointer.current === 'touch',
        tool: 'wall',
        hint: undefined,
        finding: undefined,
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
            : fitCamera(rect, view, now.editorInsetsFor(viewing)),
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
      const leftCamera = previousShown.current.camera;
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
        back === undefined || leftBoard === undefined || leftCamera === undefined
          ? undefined
          : sameScreenPlace(leftCamera, leftBoard, back);
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
    previousShown.current = { onScreen, board, camera: camera.camera };
  });

  const notePointer = useCallback((pointerType: string) => {
    lastPointer.current = pointerType;
  }, []);

  return { notePointer };
}
