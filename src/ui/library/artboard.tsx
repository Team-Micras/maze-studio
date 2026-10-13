import { memo, type CSSProperties, type FocusEvent } from 'react';

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

function artboardStyle(x: number, y: number, width: number, height: number): CSSProperties {
  return { transform: `translate(${x}px, ${y}px)`, width, height };
}

/**
 * One maze of the library's grid (DESIGN.md 7): a link that opens it, its thumbnail, and its name
 * and size above. Hover and keyboard focus ring it. A new place slides there, so a reflow moves the
 * artboards that stay mounted. A plain click pushes the route at once, so the maze opens in the
 * next frame; a modified one opens a new tab. The link is not draggable.
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
  return (
    <a
      aria-label={artboardLabel(entry)}
      className="group absolute top-0 left-0 block text-inherit no-underline outline-none transition-transform duration-[360ms] ease-(--ease-out) active:scale-[0.98]"
      data-artboard={entry.key}
      draggable={false}
      href={routeHash(routeOfEntry(entry))}
      onClick={(event) => {
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
