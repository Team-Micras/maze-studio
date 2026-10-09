import { useEffect, useRef, useState } from 'react';

import {
  centerOn,
  constrainCamera,
  EASE_OUT,
  EDITOR_INSETS,
  EDITOR_KEEP,
  EDITOR_ZOOM,
  fitOf,
  flightPath,
  panCamera,
  wheelIntent,
  zoomAround,
  type BoardView,
  type Camera,
  type Insets,
  type ScreenPoint,
  type ViewportSize,
  type WheelInput,
  type WorldPoint,
  type WorldRect,
  type ZoomRange,
} from '@/render';

/** How long the fit takes when animated (DESIGN.md 8). */
export const FIT_DURATION_MS = 260;

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

/** The camera of one board and the ways to move it. Every move stays within the limits. */
export interface BoardCamera {
  /** The camera, or `undefined` until the viewport has been measured. */
  readonly camera: Camera | undefined;
  /** The limits the camera keeps, or `undefined` until the viewport has been measured. */
  readonly view: BoardView | undefined;
  /** The fitted camera, or `undefined` until the viewport has been measured. */
  readonly fit: Camera | undefined;
  /** The viewport element, once attached. */
  readonly element: HTMLElement | null;
  /** A ref callback for the viewport element, which the camera measures. */
  readonly attach: (element: HTMLElement | null) => void;
  /** Moves to `camera`, within the limits. */
  readonly set: (camera: Camera) => void;
  /** Zooms by `factor` around `at`, or around the viewport's centre. */
  readonly zoomBy: (factor: number, at?: ScreenPoint) => void;
  /** Moves the world by screen pixels. */
  readonly panBy: (dx: number, dy: number) => void;
  /** Puts a world point at the centre of the viewport. */
  readonly centerOn: (point: WorldPoint) => void;
  /** Fits the board, in 260 ms when `animate` is set and the user allows motion. */
  readonly fitBoard: (options?: { readonly animate?: boolean }) => void;
  /** Does what a wheel event at `at` asks (DESIGN.md 7). */
  readonly wheel: (input: WheelInput, at: ScreenPoint) => void;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The camera of one board in a measured viewport. Until the user moves it, the camera follows the
 * fit, also when the viewport resizes; after a move it keeps that place within the limits.
 */
export function useBoardCamera({
  board,
  insets = EDITOR_INSETS,
  zoom = EDITOR_ZOOM,
  keep = EDITOR_KEEP,
}: BoardCameraOptions): BoardCamera {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [viewport, setViewport] = useState<ViewportSize | undefined>(undefined);
  const [chosen, setChosen] = useState<Camera | undefined>(undefined);
  const shown = useRef<Camera | undefined>(undefined);
  const animation = useRef(0);

  useEffect(() => {
    if (element === null) {
      return undefined;
    }

    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined && entry.contentRect.width > 0 && entry.contentRect.height > 0) {
        setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  useEffect(() => () => cancelAnimationFrame(animation.current), []);

  const view: BoardView | undefined =
    viewport === undefined ? undefined : { board, viewport, insets, zoom, keep };
  const fit = view === undefined ? undefined : fitOf(view);
  const camera =
    view === undefined ? undefined : chosen === undefined ? fit : constrainCamera(chosen, view);

  useEffect(() => {
    shown.current = camera;
  });

  const change = (move: (from: Camera, limits: BoardView) => Camera): void => {
    if (view === undefined) {
      return;
    }

    cancelAnimationFrame(animation.current);
    setChosen((previous) =>
      move(previous === undefined ? fitOf(view) : constrainCamera(previous, view), view)
    );
  };

  const center = (): ScreenPoint => ({
    x: (view?.viewport.width ?? 0) / 2,
    y: (view?.viewport.height ?? 0) / 2,
  });

  const fitBoard = ({ animate = false }: { readonly animate?: boolean } = {}): void => {
    if (view === undefined) {
      return;
    }

    cancelAnimationFrame(animation.current);
    const target = fitOf(view);
    const from = shown.current ?? target;

    if (!animate || prefersReducedMotion()) {
      setChosen(undefined);
      return;
    }

    const path = flightPath(from, target, view.board);
    const started = performance.now();
    const frame = (now: number): void => {
      const progress = Math.min(1, (now - started) / FIT_DURATION_MS);

      if (progress >= 1) {
        setChosen(undefined);
        return;
      }

      setChosen(path(EASE_OUT(progress)));
      animation.current = requestAnimationFrame(frame);
    };
    animation.current = requestAnimationFrame(frame);
  };

  return {
    camera,
    view,
    fit,
    element,
    attach: setElement,
    set: (next) => change((_, limits) => constrainCamera(next, limits)),
    zoomBy: (factor, at) =>
      change((from, limits) => zoomAround(from, factor, at ?? center(), limits)),
    panBy: (dx, dy) => change((from, limits) => panCamera(from, dx, dy, limits)),
    centerOn: (point) => change((from, limits) => centerOn(from, point, limits)),
    fitBoard,
    wheel: (input, at) => {
      if (view === undefined) {
        return;
      }

      const intent = wheelIntent(input, view.viewport);

      if (intent?.kind === 'zoom') {
        change((from, limits) => zoomAround(from, intent.factor, at, limits));
      } else if (intent?.kind === 'pan') {
        change((from, limits) => panCamera(from, intent.dx, intent.dy, limits));
      }
    },
  };
}
