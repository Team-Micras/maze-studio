import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
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
   */
  readonly promoted?: boolean;
  /** What the primary button or one finger draws when it does not pan. */
  readonly drawing?: StageDrawing;
  /** Runs before the stage's own keys; a key it prevents is left alone. */
  readonly onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  /** Called when the stage takes the focus, by the keyboard or not. */
  readonly onFocus?: (event: FocusEvent<HTMLDivElement>) => void;
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

/** What the primary button or one finger does: nothing (`off`) or pan (`on`). */
export type PrimaryPan = 'off' | 'on';

type Gesture =
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

/** The world layer's transform. */
function worldStyle(camera: Camera): CSSProperties {
  return { transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.k})` };
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
 * out and fit. The primary button and one finger pan as `primaryPan` says; when they do not, they
 * draw what `drawing` says. It is the `application` the keyboard focuses; whatever else the pointer
 * does on it is left to the content.
 */
export function CameraStage({
  controller,
  label,
  children,
  id,
  primaryPan = 'off',
  promoted = false,
  drawing,
  onKeyDown: onContentKey,
  onFocus,
  className,
}: CameraStageProps) {
  const pointers = useRef(new Map<number, ScreenPoint>());
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
    const draws = primary && !pans && primaryPan === 'off' && drawing !== undefined;

    if (event.pointerType !== 'mouse' || pans || draws) {
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
      (current?.kind === 'pan' && current.pointer === event.pointerId)
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
        'relative touch-none overflow-hidden outline-none select-none',
        className,
        spaceHeld && 'cursor-grab',
        panning && 'cursor-grabbing'
      )}
      data-panning={panning ? '' : undefined}
      id={id}
      onBlur={() => setSpaceHeld(false)}
      onFocus={onFocus}
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
        className={cn('absolute top-0 left-0 origin-top-left', camera === undefined && 'invisible')}
        data-world=""
        style={
          camera === undefined
            ? undefined
            : { ...worldStyle(camera), willChange: promoted ? 'transform' : undefined }
        }
      >
        {children}
      </div>
    </div>
  );
}
