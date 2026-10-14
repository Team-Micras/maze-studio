import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

import type { CatalogEntry } from '@/library';
import {
  cameraOnto,
  EASE_FLIGHT,
  fitCamera,
  libraryLayout,
  libraryRect,
  revealScroll,
  type Camera,
  type Insets,
  type WorldRect,
} from '@/render';
import { prefersReducedMotion, type CanvasCamera } from '@/ui/board/use-canvas-camera';
import { focusArtboard, libraryScroller } from '@/ui/library/library-scroller';
import type { OpenMaze } from '@/ui/open-maze';

import {
  CHROME_IN_AT,
  FLIGHT_IN_MS,
  FLIGHT_OUT_MS,
  boardOf,
  useStudio,
  useStudioStore,
} from './studio-store';

/** Where the thumbnail of the artboard `key` is on screen, if it is mounted. */
function thumbnailOnScreen(key: string): WorldRect | undefined {
  const box = document
    .querySelector(`a[data-artboard="${CSS.escape(key)}"] canvas`)
    ?.getBoundingClientRect();
  return box === undefined || box.width === 0
    ? undefined
    : { x: box.left, y: box.top, width: box.width, height: box.height };
}

/**
 * The flights between the library and a maze (DESIGN.md 8), driven by the route. When it opens a
 * maze, the board starts exactly over the thumbnail clicked and the camera flies it 620 ms to the
 * editor's fit while the grid fades out; it arrives at once when there is no thumbnail on screen,
 * the library was never shown, or motion is reduced. When it leaves, the page scrolls the
 * maze's artboard into view, hidden, and the camera flies the board 520 ms back onto its thumbnail
 * while the grid fades in. Returns what notes the kind of pointer that pressed an artboard, which
 * decides view mode.
 */
export function useStudioFlight(input: {
  readonly camera: CanvasCamera;
  /** The entries of the library's grid, in order. */
  readonly shown: readonly CatalogEntry[];
  /** The editor's insets in view mode or in edit mode. */
  readonly editorInsetsFor: (viewing: boolean) => Insets;
  /** The maze the route or a file opens. */
  readonly opened: OpenMaze | undefined;
  /** The maze on the board, a preview included. */
  readonly onScreen: OpenMaze | undefined;
  readonly phone: boolean;
  readonly libraryLoaded: boolean;
}): (pointerType: string) => void {
  const { opened, libraryLoaded } = input;
  const store = useStudioStore();
  const mode = useStudio((state) => state.mode);
  const latest = useRef(input);
  const lastPointer = useRef('mouse');
  const libraryShown = useRef(false);
  const openKey = opened?.key;
  const previousKey = useRef<string | undefined>(undefined);
  const previousShown = useRef<{ onScreen?: OpenMaze; camera?: Camera }>({});

  useLayoutEffect(() => {
    latest.current = input;
  });

  useEffect(() => {
    if (mode === 'library' && libraryLoaded) {
      libraryShown.current = true;
    }
  }, [mode, libraryLoaded]);

  useLayoutEffect(() => {
    const before = previousKey.current;
    previousKey.current = openKey;
    const now = latest.current;
    const view = now.camera.limits?.viewport;

    if (openKey === before) {
      return;
    }

    if (openKey !== undefined && before === undefined && now.opened !== undefined) {
      const from = thumbnailOnScreen(openKey);
      const viewing = now.phone || lastPointer.current === 'touch';
      const board = boardOf(now.opened.maze);
      const flies =
        from !== undefined &&
        libraryShown.current &&
        store.getState().mode === 'library' &&
        view !== undefined &&
        !prefersReducedMotion();
      store.setState({
        viewing,
        touchOpened: lastPointer.current === 'touch',
        tool: 'wall',
        hint: undefined,
        finding: undefined,
        leaving: undefined,
        preview: undefined,
        chromeIn: false,
        mode: flies ? 'flying-in' : 'editor',
      });

      if (flies) {
        now.camera.jump(cameraOnto(board, from));
      }

      now.camera.fly({
        to:
          view === undefined
            ? { x: 0, y: 0, k: 1 }
            : fitCamera(board, view, now.editorInsetsFor(viewing)),
        anchor: board,
        duration: flies ? FLIGHT_IN_MS : 0,
        easing: EASE_FLIGHT,
        land: 'fit',
        onProgress: (progress) => {
          if (progress >= CHROME_IN_AT && !store.getState().chromeIn) {
            store.setState({ chromeIn: true });
          }
        },
        onLand: () => {
          if (latest.current.opened === undefined) {
            return;
          }

          store.setState({ mode: 'editor', chromeIn: true });
          now.camera.element?.focus({ preventScroll: true });
        },
      });
      return;
    }

    if (openKey === undefined && before !== undefined) {
      const leaving = previousShown.current.onScreen;
      const leftCamera = previousShown.current.camera;
      const index = now.shown.findIndex((entry) => entry.key === leaving?.key);
      const scroller = libraryScroller();
      const layout =
        scroller === null
          ? undefined
          : libraryLayout(scroller.clientWidth, now.phone ? 'phone' : 'notebook', now.shown.length);
      const page =
        index < 0 || leaving === undefined || layout === undefined
          ? undefined
          : libraryRect(layout, index, leaving.maze);

      if (page !== undefined && scroller !== null && layout !== undefined) {
        const top = revealScroll(page, scroller.scrollTop, scroller.clientHeight, layout.insets);

        if (top !== scroller.scrollTop) {
          scroller.scrollTo({ top, behavior: 'instant' });
        }
      }

      const back =
        page === undefined || scroller === null
          ? undefined
          : { ...page, y: page.y - scroller.scrollTop };
      const board = leaving === undefined ? undefined : boardOf(leaving.maze);
      if (leftCamera !== undefined) {
        now.camera.jump(leftCamera);
      }

      const flies =
        back !== undefined &&
        board !== undefined &&
        leftCamera !== undefined &&
        store.getState().mode === 'editor' &&
        !prefersReducedMotion();
      store.setState({
        mode: flies ? 'flying-out' : 'library',
        leaving: flies ? leaving : undefined,
        preview: undefined,
        listOpen: false,
        chromeIn: false,
      });

      if (!flies) {
        requestAnimationFrame(() => requestAnimationFrame(() => focusArtboard(leaving?.key)));
        return;
      }

      now.camera.fly({
        to: cameraOnto(board, back),
        anchor: board,
        duration: FLIGHT_OUT_MS,
        easing: EASE_FLIGHT,
        land: 'keep',
        onLand: () => {
          store.setState({ mode: 'library', leaving: undefined });
          focusArtboard(leaving?.key);
        },
      });
    }
  }, [openKey, store]);

  useLayoutEffect(() => {
    previousShown.current = { onScreen: input.onScreen, camera: input.camera.camera };
  });

  return useCallback((pointerType: string) => {
    lastPointer.current = pointerType;
  }, []);
}
