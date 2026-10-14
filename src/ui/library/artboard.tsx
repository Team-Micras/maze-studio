import { memo, useRef, type CSSProperties, type FocusEvent } from 'react';

import type { CatalogEntry } from '@/library';
import type { Maze } from '@/maze';
import type { ThumbnailBand } from '@/render';
import { ThumbnailCanvas } from '@/ui/board/thumbnail-canvas';
import { pushRoute } from '@/ui/navigation';
import { routeHash, routeOfEntry } from '@/ui/routes';

import { artboardLabel } from './artboard-label';

/** The props of {@link Artboard}. */
export interface ArtboardProps {
  readonly entry: CatalogEntry;
  readonly maze: Maze;
  /** Where its thumbnail lies in the grid, in CSS pixels; plain numbers, so `memo` holds. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** The side of its square slot, which its name and size above span. */
  readonly slot: number;
  /** The thumbnail band its size on screen needs. */
  readonly band: ThumbnailBand;
  readonly onFocus: (key: string, event: FocusEvent<HTMLAnchorElement>) => void;
}

/** How long after a touch opened the maze its click may still come, to be ignored. */
const CLICK_AFTER_TOUCH_MS = 400;

/** How far a finger may move, in CSS pixels, and still open the artboard it lifts from. */
const TOUCH_SLOP = 10;

function artboardStyle(x: number, y: number, width: number, height: number): CSSProperties {
  return { transform: `translate(${x}px, ${y}px)`, width, height };
}

/**
 * One maze of the library's grid (DESIGN.md 7): a link that opens it, its thumbnail, and its name
 * and size above. Hover and keyboard focus ring it. A new place slides there, so a reflow moves the
 * artboards that stay mounted. A plain click pushes the route at once, so the maze opens in the
 * next frame; a modified one opens a new tab. The link is not draggable, and a finger held on it
 * opens no menu and selects nothing: held, it stays put; lifted without moving, even after a long
 * press, it opens the maze; moved, it scrolls the grid.
 */
export const Artboard = memo(function Artboard({
  entry,
  maze,
  x,
  y,
  width,
  height,
  slot,
  band,
  onFocus,
}: ArtboardProps) {
  const press = useRef<{ readonly id: number; readonly x: number; readonly y: number } | undefined>(
    undefined
  );
  const openedByTouch = useRef(false);

  return (
    <a
      aria-label={artboardLabel(entry)}
      className="group absolute top-0 left-0 block text-inherit no-underline outline-none transition-transform duration-[360ms] ease-(--ease-out) select-none [-webkit-touch-callout:none]"
      data-artboard={entry.key}
      draggable={false}
      href={routeHash(routeOfEntry(entry))}
      onClick={(event) => {
        if (openedByTouch.current) {
          openedByTouch.current = false;
          event.preventDefault();
          return;
        }

        if (
          !event.defaultPrevented &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey &&
          !event.altKey
        ) {
          event.preventDefault();
          pushRoute(routeOfEntry(entry));
        }
      }}
      onPointerCancel={() => {
        press.current = undefined;
      }}
      onPointerDown={(event) => {
        openedByTouch.current = false;
        press.current =
          event.pointerType === 'touch'
            ? { id: event.pointerId, x: event.clientX, y: event.clientY }
            : undefined;
      }}
      onPointerMove={(event) => {
        const start = press.current;

        if (
          start !== undefined &&
          Math.hypot(event.clientX - start.x, event.clientY - start.y) > TOUCH_SLOP
        ) {
          press.current = undefined;
        }
      }}
      onPointerUp={(event) => {
        if (press.current?.id === event.pointerId) {
          press.current = undefined;
          openedByTouch.current = true;
          window.setTimeout(() => {
            openedByTouch.current = false;
          }, CLICK_AFTER_TOUCH_MS);
          pushRoute(routeOfEntry(entry));
        }
      }}
      onContextMenu={(event) => {
        if (
          event.nativeEvent instanceof PointerEvent &&
          event.nativeEvent.pointerType === 'touch'
        ) {
          event.preventDefault();
        }
      }}
      onFocus={(event) => onFocus(entry.key, event)}
      style={artboardStyle(x, y, width, height)}
    >
      <span
        aria-hidden
        className="absolute bottom-full flex items-baseline gap-2 pb-[7px] text-xs leading-4 whitespace-nowrap text-muted-foreground"
        style={{ left: (width - slot) / 2, width: slot }}
      >
        <b className="min-w-0 truncate font-medium text-foreground" translate="no">
          {entry.name}
        </b>
        <span className="ml-auto flex-none font-mono tabular-nums">
          {entry.width} × {entry.height}
        </span>
      </span>
      <ThumbnailCanvas
        className="rounded-[4px] bg-[oklch(0.17_0_0)] shadow-artboard outline-ring group-hover:outline-2 group-hover:outline-offset-[3px] group-hover:outline-solid group-focus-visible:outline-2 group-focus-visible:outline-offset-[3px] group-focus-visible:outline-solid"
        height={height}
        maze={maze}
        resolution={band}
        width={width}
      />
    </a>
  );
});
