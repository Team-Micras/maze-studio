import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';

import {
  KEY_ZOOM_FACTOR,
  zoomKey,
  type Camera,
  type PointerPair,
  type ScreenPoint,
} from '@/render';
import { cn } from '@/ui/primitives/utils';

import type { CanvasCamera } from './use-canvas-camera';

/** The props of {@link CameraStage}. */
export interface CameraStageProps {
  readonly controller: CanvasCamera;
  /** What a screen reader announces for the canvas. */
  readonly label: string;
  /** The world: content placed in world units, scaled and moved by the camera. */
  readonly children: ReactNode;
  /** The element's id, which the skip link points at. */
  readonly id?: string;
  /** What the primary button or one finger does; nothing by default. */
  readonly primaryPan?: PrimaryPan;
  /**
   * Whether the world layer is promoted (`will-change: transform`), as only during a flight
   * (DESIGN.md 8): a promoted layer scales a texture instead of repainting, but blurs when zoomed.
   * It carries `data-promoted` meanwhile, so content that fades can take a layer of its own, since
   * a change of opacity inside the promoted layer would repaint all of it.
   */
  readonly promoted?: boolean;
  /**
   * The scale counter-scaled content follows instead of the camera's, as during a flight: content
   * whose size changed at every frame would repaint the promoted layer at every frame.
   */
  readonly fixedScale?: number;
  /** What the primary button or one finger draws when it does not pan. */
  readonly drawing?: StageDrawing;
  /** Runs before the stage's own keys; a key it prevents is left alone. */
  readonly onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  readonly className?: string;
}

/** What a drawing pointer says besides where it is. */
export interface DrawInput {
  readonly pointerType: string;
  /** Whether Shift is held, read again at every move (DESIGN.md 10). */
  readonly shiftKey: boolean;
}

/**
 * A gesture the content draws with the primary button or one finger, on stage coordinates. A
 * second finger takes it back and pinches instead, so one finger draws and two pan and zoom.
 */
export interface StageDrawing {
  /** Starts a gesture at a press; `false` leaves the press alone. */
  readonly begin: (point: ScreenPoint, input: DrawInput) => boolean;
  /** Follows the pointer through every position since the last move, coalesced ones included. */
  readonly move: (points: readonly ScreenPoint[], input: DrawInput) => void;
  /** Ends the gesture where it is. */
  readonly end: () => void;
  /** Takes back what the gesture did. */
  readonly cancel: () => void;
  /** Follows a pointer over the canvas with no button down; `undefined` when it leaves. */
  readonly hover?: (point: ScreenPoint | undefined) => void;
}

/** How far, in pixels, a press must move before a lazy pan takes it over from a click. */
const DRAG_THRESHOLD = 5;

/**
 * What the primary button or one finger does: nothing (`off`), pan at once (`on`), or pan once it
 * moves past a few pixels, so that a tap or a click still reaches the content (`lazy`).
 */
export type PrimaryPan = 'off' | 'on' | 'lazy';

type Gesture =
  | {
      readonly kind: 'press';
      readonly pointer: number;
      readonly origin: ScreenPoint;
      readonly from: Camera;
    }
  | {
      readonly kind: 'pan';
      readonly pointer: number;
      readonly origin: ScreenPoint;
      readonly from: Camera;
    }
  | { readonly kind: 'pinch'; readonly from: PointerPair; readonly start: Camera }
  | { readonly kind: 'draw'; readonly pointer: number };

const MIDDLE_BUTTON = 1;
const PRIMARY_BUTTON = 0;

/**
 * The world layer's transform, and the scale and its inverse for counter-scaled content: the
 * camera's, or `fixedScale` when given.
 */
function worldStyle(
  camera: Camera,
  fixedScale: number | undefined
): CSSProperties & Record<'--k' | '--ik', number> {
  const scale = fixedScale ?? camera.k;
  return {
    transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.k})`,
    '--k': scale,
    '--ik': 1 / scale,
  };
}

function localPoint(
  element: HTMLElement,
  event: { clientX: number; clientY: number }
): ScreenPoint {
  const box = element.getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top };
}

function pairOf(pointers: ReadonlyMap<number, ScreenPoint>): PointerPair | undefined {
  const [first, second] = pointers.values();
  return first === undefined || second === undefined ? undefined : [first, second];
}

/**
 * The canvas a board lies on (DESIGN.md 7): the wheel pans, Ctrl or Cmd with the wheel and a
 * pinch zoom, Space with a drag and the middle button pan, and `+` (also `=`), `-` and `0` zoom in,
 * out and fit. The primary button and one finger pan as `primaryPan` says; a lazy pan swallows
 * the click that ends it. When they do not pan, they draw what `drawing` says. It is the `application` the keyboard focuses; whatever else the pointer
 * does on it is left to the content.
 */
export function CameraStage({
  controller,
  label,
  children,
  id,
  primaryPan = 'off',
  promoted = false,
  fixedScale,
  drawing,
  onKeyDown: onContentKey,
  className,
}: CameraStageProps) {
  const pointers = useRef(new Map<number, ScreenPoint>());
  const dragged = useRef(false);
  const gesture = useRef<Gesture | undefined>(undefined);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const { attach, camera, element, wheel } = controller;

  useEffect(() => {
    if (element === null) {
      return undefined;
    }

    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      wheel(event, localPoint(element, event));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [element, wheel]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    const point = localPoint(event.currentTarget, event);
    const primary = event.button === PRIMARY_BUTTON;
    const pans = event.button === MIDDLE_BUTTON || (primary && (spaceHeld || primaryPan === 'on'));
    const presses = primary && primaryPan === 'lazy';
    const draws = primary && !pans && primaryPan === 'off' && drawing !== undefined;
    dragged.current = false;

    if (event.pointerType !== 'mouse' || pans || presses || draws) {
      pointers.current.set(event.pointerId, point);
    }

    const pair = pairOf(pointers.current);

    if (pointers.current.size === 2 && pair !== undefined && camera !== undefined) {
      if (gesture.current?.kind === 'draw') {
        drawing?.cancel();
      }

      event.currentTarget.setPointerCapture(event.pointerId);
      gesture.current = { kind: 'pinch', from: pair, start: camera };
      setPanning(false);
      return;
    }

    if (
      pointers.current.size === 1 &&
      draws &&
      drawing.begin(point, { pointerType: event.pointerType, shiftKey: event.shiftKey })
    ) {
      event.currentTarget.setPointerCapture(event.pointerId);
      gesture.current = { kind: 'draw', pointer: event.pointerId };
      return;
    }

    if (pointers.current.size === 1 && pans && camera !== undefined) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      gesture.current = { kind: 'pan', pointer: event.pointerId, origin: point, from: camera };
      setPanning(true);
    } else if (pointers.current.size === 1 && presses && camera !== undefined) {
      gesture.current = { kind: 'press', pointer: event.pointerId, origin: point, from: camera };
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (!pointers.current.has(event.pointerId)) {
      if (event.buttons === 0 && event.pointerType === 'mouse') {
        drawing?.hover?.(localPoint(event.currentTarget, event));
      }

      return;
    }

    const point = localPoint(event.currentTarget, event);
    pointers.current.set(event.pointerId, point);
    const current = gesture.current;

    if (current?.kind === 'draw' && current.pointer === event.pointerId) {
      const stage = event.currentTarget;
      const coalesced = event.nativeEvent.getCoalescedEvents?.() ?? [];
      drawing?.move(
        coalesced.length === 0 ? [point] : coalesced.map((each) => localPoint(stage, each)),
        { pointerType: event.pointerType, shiftKey: event.shiftKey }
      );
      return;
    }

    if (
      current?.kind === 'press' &&
      current.pointer === event.pointerId &&
      Math.hypot(point.x - current.origin.x, point.y - current.origin.y) > DRAG_THRESHOLD
    ) {
      event.currentTarget.setPointerCapture(event.pointerId);
      gesture.current = { ...current, kind: 'pan' };
      dragged.current = true;
      setPanning(true);
    }

    if (current?.kind === 'pinch') {
      const pair = pairOf(pointers.current);

      if (pair !== undefined) {
        controller.pinch(current.start, current.from, pair);
      }
    } else if (current?.kind === 'pan' && current.pointer === event.pointerId) {
      controller.set({
        ...current.from,
        x: current.from.x + point.x - current.origin.x,
        y: current.from.y + point.y - current.origin.y,
      });
    }
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>): void => {
    pointers.current.delete(event.pointerId);
    const current = gesture.current;

    if (current?.kind === 'draw' && current.pointer === event.pointerId) {
      gesture.current = undefined;

      if (event.type === 'pointercancel') {
        drawing?.cancel();
      } else {
        drawing?.end();
      }

      return;
    }

    if (
      current?.kind === 'pinch' ||
      ((current?.kind === 'pan' || current?.kind === 'press') &&
        current.pointer === event.pointerId)
    ) {
      gesture.current = undefined;
      setPanning(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    onContentKey?.(event);

    if (event.defaultPrevented) {
      return;
    }

    if (event.key === ' ') {
      event.preventDefault();
      setSpaceHeld(true);
      return;
    }

    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    const zoom = zoomKey(event.key);

    if (zoom === 'in') {
      controller.zoomBy(KEY_ZOOM_FACTOR);
    } else if (zoom === 'out') {
      controller.zoomBy(1 / KEY_ZOOM_FACTOR);
    } else if (zoom === 'fit') {
      controller.refit({ animate: true });
    }

    if (zoom !== undefined) {
      event.preventDefault();
    }
  };

  const onKeyUp = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === ' ') {
      setSpaceHeld(false);
    }
  };

  return (
    <div
      aria-label={label}
      aria-roledescription="canvas"
      className={cn(
        'relative touch-none overflow-hidden bg-background outline-none select-none',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        className,
        spaceHeld && 'cursor-grab',
        panning && 'cursor-grabbing'
      )}
      data-panning={panning ? '' : undefined}
      id={id}
      onBlur={() => setSpaceHeld(false)}
      onClickCapture={(event) => {
        if (dragged.current) {
          dragged.current = false;
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onPointerCancel={onPointerEnd}
      onPointerDown={onPointerDown}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') {
          drawing?.hover?.(undefined);
        }
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      ref={attach}
      role="application"
      tabIndex={0}
    >
      <div
        className={cn(
          'group/world absolute top-0 left-0 origin-top-left',
          camera === undefined && 'invisible'
        )}
        data-promoted={promoted ? '' : undefined}
        data-world=""
        style={
          camera === undefined
            ? undefined
            : { ...worldStyle(camera, fixedScale), willChange: promoted ? 'transform' : undefined }
        }
      >
        {children}
      </div>
    </div>
  );
}
