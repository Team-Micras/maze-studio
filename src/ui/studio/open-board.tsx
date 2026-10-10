import type { CSSProperties } from 'react';

import type { Maze } from '@/maze';
import type { BoardOverlays, WorldRect } from '@/render';
import { Board } from '@/ui/board/board';

/** The props of {@link OpenBoard}. */
export interface OpenBoardProps {
  readonly maze: Maze;
  /** Where it lies in the world: over the artboard it was opened from. */
  readonly rect: WorldRect;
  /** Whether it shows; it fades in over the thumbnail and out again (DESIGN.md 8). */
  readonly shown: boolean;
  /** The editor's cursor and edge preview. */
  readonly overlays?: BoardOverlays;
}

function placeStyle(rect: WorldRect): CSSProperties {
  return {
    transform: `translate(${rect.x}px, ${rect.y}px)`,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * The full board of the open maze in the world, cross-fading over the artboard's thumbnail in
 * 300 ms as the flight starts, so nothing swaps or resizes on landing. It is mounted hidden as soon
 * as the artboard is pressed, so the click's frame only shows it. The pointer goes through it to
 * the canvas.
 */
export function OpenBoard({ maze, rect, shown, overlays }: OpenBoardProps) {
  return (
    <div
      className="pointer-events-none absolute top-0 left-0 transition-opacity group-data-promoted/world:will-change-[opacity] duration-300 ease-(--ease-out) starting:opacity-0 data-hidden:opacity-0"
      data-hidden={shown ? undefined : ''}
      data-open-board=""
      style={placeStyle(rect)}
    >
      <Board className="size-full" maze={maze} overlays={overlays} />
    </div>
  );
}
