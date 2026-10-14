import type { CSSProperties } from 'react';

import type { Maze } from '@/maze';
import type { BoardOverlays, WorldRect } from '@/render';
import { Board } from '@/ui/board/board';
import { cn } from '@/ui/primitives/utils';

/** The props of {@link OpenBoard}. */
export interface OpenBoardProps {
  readonly maze: Maze;
  /** Where it lies in the world: over the artboard it was opened from. */
  readonly rect: WorldRect;
  /** Whether it shows; it fades in over the thumbnail as the flight in starts (DESIGN.md 8). */
  readonly shown: boolean;
  /**
   * Whether it fades in as it mounts, as on the way in; the board of the flight back mounts again
   * as the route leaves it and must show at once.
   */
  readonly fadeIn?: boolean;
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
 * 300 ms as the flight in starts, so nothing swaps or resizes on landing; on the way back it flies
 * down onto the thumbnail and gives way to it on landing. It is mounted hidden as soon as the
 * artboard is pressed, so the click's frame only shows it. The pointer goes through it to the
 * canvas.
 */
export function OpenBoard({ maze, rect, shown, fadeIn = true, overlays }: OpenBoardProps) {
  return (
    <div
      className={cn(
        'pointer-events-none absolute top-0 left-0 transition-opacity duration-300 ease-(--ease-out) data-hidden:opacity-0',
        fadeIn && 'starting:opacity-0'
      )}
      data-hidden={shown ? undefined : ''}
      data-open-board=""
      style={placeStyle(rect)}
    >
      <Board className="size-full" maze={maze} overlays={overlays} />
    </div>
  );
}
