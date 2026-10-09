import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  centerOn,
  constrainCamera,
  EASE_OUT,
  flightPath,
  panCamera,
  pinchCamera,
  wheelIntent,
  zoomAround,
  type Camera,
  type CameraLimits,
  type PointerPair,
  type ScreenPoint,
  type ViewportSize,
  type WheelInput,
  type WorldPoint,
  type WorldRect,
} from '@/render';

/** How long the fit takes when animated (DESIGN.md 8). */
export const FIT_DURATION_MS = 260;

/** What a canvas camera is set up with. */
export interface CanvasCameraOptions {
  /** The content the camera shows, in world units; the fit animation is anchored on it. */
  readonly content: WorldRect;
  /** The limits for a viewport of a given size. */
  readonly limits: (viewport: ViewportSize) => CameraLimits;
}

/** The camera of a canvas and the ways to move it. Every move stays within the limits. */
export interface CanvasCamera {
  /** The camera, or `undefined` until the viewport has been measured. */
  readonly camera: Camera | undefined;
  /** The limits the camera keeps, or `undefined` until the viewport has been measured. */
  readonly limits: CameraLimits | undefined;
  /** The content, in world units. */
  readonly content: WorldRect;
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
  /** Follows a pinch that started at `start` with the fingers at `from`, now at `to`. */
  readonly pinch: (start: Camera, from: PointerPair, to: PointerPair) => void;
  /** Fits the content, in 260 ms when `animate` is set and the user allows motion. */
  readonly refit: (options?: { readonly animate?: boolean }) => void;
  /** Does what a wheel event at `at` asks (DESIGN.md 7). */
  readonly wheel: (input: WheelInput, at: ScreenPoint) => void;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The camera of a canvas in a measured viewport. Until the user moves it, the camera follows the
 * fit, also when the viewport or the content changes; after a move it keeps that place within the
 * limits.
 */
export function useCanvasCamera({ content, limits: limitsFor }: CanvasCameraOptions): CanvasCamera {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [viewport, setViewport] = useState<ViewportSize | undefined>(undefined);
  const [chosen, setChosen] = useState<Camera | undefined>(undefined);
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

  const limits = viewport === undefined ? undefined : limitsFor(viewport);
  const camera =
    limits === undefined
      ? undefined
      : chosen === undefined
        ? limits.fit
        : constrainCamera(chosen, limits);
  const latest = useRef({ camera, limits, content });

  useLayoutEffect(() => {
    latest.current = { camera, limits, content };
  });

  const change = useCallback((move: (from: Camera, current: CameraLimits) => Camera): void => {
    const current = latest.current.limits;

    if (current === undefined) {
      return;
    }

    cancelAnimationFrame(animation.current);
    setChosen((previous) =>
      move(previous === undefined ? current.fit : constrainCamera(previous, current), current)
    );
  }, []);

  const refit = useCallback(({ animate = false }: { readonly animate?: boolean } = {}): void => {
    const { camera: from, limits: current, content: anchor } = latest.current;

    if (current === undefined) {
      return;
    }

    cancelAnimationFrame(animation.current);

    if (!animate || from === undefined || prefersReducedMotion()) {
      setChosen(undefined);
      return;
    }

    const path = flightPath(from, current.fit, anchor);
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
  }, []);

  const set = useCallback(
    (next: Camera) => change((_, current) => constrainCamera(next, current)),
    [change]
  );
  const zoomBy = useCallback(
    (factor: number, at?: ScreenPoint) =>
      change((from, current) =>
        zoomAround(
          from,
          factor,
          at ?? { x: current.viewport.width / 2, y: current.viewport.height / 2 },
          current
        )
      ),
    [change]
  );
  const panBy = useCallback(
    (dx: number, dy: number) => change((from, current) => panCamera(from, dx, dy, current)),
    [change]
  );
  const center = useCallback(
    (point: WorldPoint) => change((from, current) => centerOn(from, point, current)),
    [change]
  );
  const pinch = useCallback(
    (start: Camera, from: PointerPair, to: PointerPair) =>
      change((_, current) => pinchCamera(start, from, to, current)),
    [change]
  );
  const wheel = useCallback(
    (input: WheelInput, at: ScreenPoint) => {
      const current = latest.current.limits;
      const intent = current === undefined ? undefined : wheelIntent(input, current.viewport);

      if (intent?.kind === 'zoom') {
        change((from, now) => zoomAround(from, intent.factor, at, now));
      } else if (intent?.kind === 'pan') {
        change((from, now) => panCamera(from, intent.dx, intent.dy, now));
      }
    },
    [change]
  );

  return {
    camera,
    limits,
    content,
    element,
    attach: setElement,
    set,
    zoomBy,
    panBy,
    centerOn: center,
    pinch,
    refit,
    wheel,
  };
}
