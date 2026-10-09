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

/** A camera placed by a move, and whether it is free of the limits, as during a flight. */
interface Placed {
  readonly camera: Camera;
  readonly free: boolean;
}

/** An animated move of the camera along the flight path of DESIGN.md 8. */
export interface Flight {
  /** Where the camera lands. */
  readonly to: Camera;
  /** The world rectangle whose centre moves on a straight line on screen. */
  readonly anchor: WorldRect;
  /** In milliseconds; 0 jumps at once. */
  readonly duration: number;
  readonly easing: (progress: number) => number;
  /** After landing, follow the fit of the limits then in force, or keep the camera landed on. */
  readonly land: 'fit' | 'keep';
  /** Called at every frame with the progress, 0 to 1. */
  readonly onProgress?: (progress: number) => void;
  /** Called in the landing frame, before the camera is handed back to the limits. */
  readonly onLand?: () => void;
}

/**
 * The camera of a canvas and the ways to move it. Every move stays within the limits, except a
 * flight and a jump, which are free of them until the next move; the user's moves wait for a
 * flight to land.
 */
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
  /** Flies the camera free of the limits, landing as the flight says. */
  readonly fly: (flight: Flight) => void;
  /** Puts the camera at once where given, free of the limits until the next move. */
  readonly jump: (camera: Camera) => void;
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
  const [placed, setPlaced] = useState<Placed | undefined>(undefined);
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

  useEffect(
    () => () => {
      cancelAnimationFrame(animation.current);
    },
    []
  );

  const limits = viewport === undefined ? undefined : limitsFor(viewport);
  const camera =
    limits === undefined
      ? undefined
      : placed === undefined
        ? limits.fit
        : placed.free
          ? placed.camera
          : constrainCamera(placed.camera, limits);
  const latest = useRef({ camera, limits, content });
  const flying = useRef(false);

  useLayoutEffect(() => {
    latest.current = { camera, limits, content };
  });

  const change = useCallback((move: (from: Camera, current: CameraLimits) => Camera): void => {
    const current = latest.current.limits;

    if (current === undefined || flying.current) {
      return;
    }

    cancelAnimationFrame(animation.current);
    setPlaced((previous) => ({
      camera: move(
        previous === undefined ? current.fit : constrainCamera(previous.camera, current),
        current
      ),
      free: false,
    }));
  }, []);

  const fly = useCallback((flight: Flight): void => {
    const from = latest.current.camera;
    cancelAnimationFrame(animation.current);
    flying.current = false;

    if (from === undefined || flight.duration <= 0) {
      flight.onLand?.();
      setPlaced(flight.land === 'fit' ? undefined : { camera: flight.to, free: false });
      return;
    }

    const path = flightPath(from, flight.to, flight.anchor);
    const started = performance.now();
    const frame = (now: number): void => {
      const progress = Math.min(1, (now - started) / flight.duration);
      flight.onProgress?.(progress);

      if (progress >= 1) {
        flying.current = false;
        flight.onLand?.();
        setPlaced(flight.land === 'fit' ? undefined : { camera: flight.to, free: false });
        return;
      }

      setPlaced({ camera: path(flight.easing(progress)), free: true });
      animation.current = requestAnimationFrame(frame);
    };
    flying.current = true;
    setPlaced({ camera: from, free: true });
    animation.current = requestAnimationFrame(frame);
  }, []);

  const jump = useCallback((next: Camera): void => {
    cancelAnimationFrame(animation.current);
    flying.current = false;
    setPlaced({ camera: next, free: true });
  }, []);

  const refit = useCallback(
    ({ animate = false }: { readonly animate?: boolean } = {}): void => {
      const { limits: current, content: anchor } = latest.current;

      if (current === undefined) {
        return;
      }

      fly({
        to: current.fit,
        anchor,
        duration: animate && !prefersReducedMotion() ? FIT_DURATION_MS : 0,
        easing: EASE_OUT,
        land: 'fit',
      });
    },
    [fly]
  );

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
    fly,
    jump,
    wheel,
  };
}
