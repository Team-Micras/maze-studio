import { useRef, useState, type PointerEvent } from 'react';

import type { Maze } from '@/maze';
import { MINIMAP_SIZE, minimapFrame, minimapView, minimapWorldPoint, showsMinimap } from '@/render';
import { cn } from '@/ui/primitives/utils';

import { ThumbnailCanvas } from './thumbnail-canvas';
import type { CanvasCamera } from './use-canvas-camera';

const PRIMARY_BUTTONS = 1;

/** The props of {@link Minimap}. */
export interface MinimapProps {
  readonly maze: Maze;
  readonly controller: CanvasCamera;
  /** The longest side of its board, in CSS pixels; 148 by default. */
  readonly size?: number;
  readonly className?: string;
}

/**
 * The whole board in small with the part on screen marked (PLAN.md 3.4, DESIGN.md 9.2). It shows
 * only past 1.06 times the fit; a primary click or touch centres the view on that point and a drag
 * keeps doing so. It paints the live maze itself, outside the thumbnail cache.
 * Pointer only and hidden from screen readers: the zoom keys and the camera's own gestures are
 * the accessible ways to move.
 */
export function Minimap({ maze, controller, size = MINIMAP_SIZE, className }: MinimapProps) {
  const board = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const { camera, limits, content } = controller;

  if (camera === undefined || limits === undefined) {
    return null;
  }

  const frame = minimapFrame(content, size);
  const visible = minimapView(camera, limits.viewport, content, frame);
  const shown = showsMinimap(camera.k, limits.fit.k);

  const centerAt = (event: PointerEvent<HTMLDivElement>): void => {
    const box = board.current?.getBoundingClientRect();

    if (box === undefined) {
      return;
    }

    controller.centerOn(
      minimapWorldPoint({ x: event.clientX - box.left, y: event.clientY - box.top }, content, frame)
    );
  };

  const stop = (): void => setDragging(false);

  return (
    <div
      aria-hidden
      className={cn(
        'absolute z-10 touch-none rounded-[12px] bg-card p-1.5 shadow-island',
        'transition-[opacity,transform] duration-200 ease-(--ease)',
        dragging ? 'cursor-grabbing' : 'cursor-grab',
        !shown && 'pointer-events-none -translate-y-1 scale-[0.96] opacity-0',
        className
      )}
      data-dragging={dragging ? '' : undefined}
      data-minimap={shown ? 'shown' : 'hidden'}
      onLostPointerCapture={stop}
      onPointerCancel={stop}
      onPointerDown={(event) => {
        if ((event.buttons & PRIMARY_BUTTONS) === 0) {
          return;
        }

        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        centerAt(event);
      }}
      onPointerMove={(event) => {
        if (dragging && (event.buttons & PRIMARY_BUTTONS) !== 0) {
          centerAt(event);
        }
      }}
      onPointerUp={stop}
    >
      <div
        className="relative overflow-hidden rounded-[5px]"
        data-minimap-board=""
        ref={board}
        style={{ width: frame.width, height: frame.height }}
      >
        <ThumbnailCanvas cached={false} height={frame.height} maze={maze} width={frame.width} />
        <div
          className="pointer-events-none absolute top-0 left-0 rounded-[3px] bg-[oklch(1_0_0/0.12)] shadow-[0_0_0_1.5px_oklch(0.985_0_0),0_0_0_3px_oklch(0_0_0/0.35)]"
          data-minimap-view=""
          style={{
            transform: `translate(${visible.x}px, ${visible.y}px)`,
            width: visible.width,
            height: visible.height,
          }}
        />
      </div>
    </div>
  );
}
