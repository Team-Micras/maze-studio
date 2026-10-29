import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useStore, type StoreApi } from 'zustand';

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
import { focusArtboard, libraryScroller, scrolledInsets } from '@/ui/library/library-scroller';
import type { OpenMaze } from '@/ui/open-maze';

import {
  CHROME_IN_AT,
  FLIGHT_IN_MS,
  FLIGHT_OUT_MS,
  boardOf,
  type StudioState,
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

/** What the flights read of the studio, as of the latest render. */
interface FlightInput {
  readonly store: StoreApi<StudioState>;
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
}

/** What the last render showed: the key of the maze the route opened, the board's maze and the camera. */
interface Shown {
  readonly key?: string;
  readonly onScreen?: OpenMaze;
  readonly camera?: Camera;
}

/**
 * Opens the maze the route opened: from the thumbnail on screen, 620 ms to the editor's fit, when the library was
 * shown, nothing else flies and motion is not reduced; at once otherwise. A touch opens it to look
 * at. The landing puts the editor on screen only while `stillOpen` says a maze is open.
 */
function flyIn(
  now: FlightInput,
  {
    touch,
    libraryShown,
    stillOpen,
  }: { touch: boolean; libraryShown: boolean; stillOpen: () => boolean }
): void {
  const { store, opened } = now;

  if (opened === undefined) {
    return;
  }

  const view = now.camera.limits?.viewport;
  const from = thumbnailOnScreen(opened.key);
  const viewing = now.phone || touch;
  const board = boardOf(opened.maze);
  const flies =
    from !== undefined &&
    libraryShown &&
    store.getState().mode === 'library' &&
    view !== undefined &&
    !prefersReducedMotion();
  store.setState({
    viewing,
    touchOpened: touch,
    tool: 'wall',
    hint: undefined,
    finding: undefined,
    leaving: undefined,
    preview: undefined,
    prepared: undefined,
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
      if (!stillOpen()) {
        return;
      }

      store.setState({ mode: 'editor', chromeIn: true });
      now.camera.element?.focus({ preventScroll: true });
    },
  });
}

/**
 * Leaves the maze the last render showed for the library: scrolls its artboard into view, hidden,
 * puts the camera back where the board was, and flies it 520 ms onto the thumbnail; at once, with
 * the focus on the artboard, when there is no artboard, the editor was not on screen or motion is
 * reduced.
 */
function flyOut(now: FlightInput, previous: Shown): void {
  const { store } = now;
  const { onScreen: leaving, camera: leftCamera } = previous;
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
    const top = revealScroll(
      page,
      scroller.scrollTop,
      scroller.clientHeight,
      scrolledInsets(scroller, layout.insets)
    );

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

/**
 * The flights between the library and a maze (DESIGN.md 8), driven by the route: {@link flyIn}
 * when it opens a maze, {@link flyOut} when it leaves one. Returns what notes the kind of pointer
 * that pressed an artboard, which decides view mode.
 */
export function useStudioFlight(input: FlightInput): (pointerType: string) => void {
  const { store } = input;
  const mode = useStore(store, (state) => state.mode);
  const latest = useRef(input);
  const lastPointer = useRef('mouse');
  const libraryShown = useRef(false);
  const previous = useRef<Shown>({});
  const openKey = input.opened?.key;
  const { libraryLoaded } = input;

  useLayoutEffect(() => {
    latest.current = input;
  });

  useEffect(() => {
    if (mode === 'library' && libraryLoaded) {
      libraryShown.current = true;
    }
  }, [mode, libraryLoaded]);

  useLayoutEffect(() => {
    const before = previous.current;
    const now = latest.current;

    if (openKey === before.key) {
      return;
    }

    if (openKey !== undefined && before.key === undefined) {
      flyIn(now, {
        touch: lastPointer.current === 'touch',
        libraryShown: libraryShown.current,
        stillOpen: () => latest.current.opened !== undefined,
      });
    } else if (openKey === undefined && before.key !== undefined) {
      flyOut(now, before);
    }
  }, [openKey]);

  useLayoutEffect(() => {
    previous.current = { key: openKey, onScreen: input.onScreen, camera: input.camera.camera };
  });

  return useCallback((pointerType: string) => {
    lastPointer.current = pointerType;
  }, []);
}
