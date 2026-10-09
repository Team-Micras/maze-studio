import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';

import {
  KEY_ZOOM_FACTOR,
  pinchCamera,
  zoomKey,
  type Camera,
  type PointerPair,
  type ScreenPoint,
} from '@/render';
import { cn } from '@/ui/primitives/utils';

import type { BoardCamera } from './use-board-camera';

/** The props of {@link CameraStage}. */
export interface CameraStageProps {
  readonly controller: BoardCamera;
  /** What a screen reader announces for the canvas. */
  readonly label: string;
  /** The world: content placed in world units, scaled and moved by the camera. */
  readonly children: ReactNode;
  readonly className?: string;
}

type Gesture =
  | {
      readonly kind: 'pan';
      readonly pointer: number;
      readonly origin: ScreenPoint;
      readonly from: Camera;
    }
  | { readonly kind: 'pinch'; readonly from: PointerPair; readonly start: Camera };

const MIDDLE_BUTTON = 1;
const PRIMARY_BUTTON = 0;

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
 * out and fit. It is the `application` the keyboard focuses; whatever else the pointer does on it
 * is left to the content.
 */
export function CameraStage({ controller, label, children, className }: CameraStageProps) {
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
    const pans = event.button === MIDDLE_BUTTON || (event.button === PRIMARY_BUTTON && spaceHeld);

    if (event.pointerType !== 'mouse' || pans) {
      pointers.current.set(event.pointerId, point);
    }

    const pair = pairOf(pointers.current);

    if (pointers.current.size === 2 && pair !== undefined && camera !== undefined) {
      event.currentTarget.setPointerCapture(event.pointerId);
      gesture.current = { kind: 'pinch', from: pair, start: camera };
      setPanning(false);
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
      return;
    }

    const point = localPoint(event.currentTarget, event);
    pointers.current.set(event.pointerId, point);
    const current = gesture.current;

    if (current?.kind === 'pinch' && controller.view !== undefined) {
      const pair = pairOf(pointers.current);

      if (pair !== undefined) {
        controller.set(pinchCamera(current.start, current.from, pair, controller.view));
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

    if (
      current?.kind === 'pinch' ||
      (current?.kind === 'pan' && current.pointer === event.pointerId)
    ) {
      gesture.current = undefined;
      setPanning(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
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
      controller.fitBoard({ animate: true });
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
        spaceHeld && 'cursor-grab',
        panning && 'cursor-grabbing',
        className
      )}
      data-panning={panning ? '' : undefined}
      onBlur={() => setSpaceHeld(false)}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onPointerCancel={onPointerEnd}
      onPointerDown={onPointerDown}
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
            : { transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.k})` }
        }
      >
        {children}
      </div>
    </div>
  );
}
