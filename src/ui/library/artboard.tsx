import { memo, type CSSProperties, type FocusEvent } from 'react';

import type { CatalogEntry } from '@/library';
import type { Maze } from '@/maze';
import type { ThumbnailBand, WorldRect } from '@/render';
import { ThumbnailCanvas } from '@/ui/board/thumbnail-canvas';
import { pushRoute } from '@/ui/navigation';
import { routeHash, routeOfEntry } from '@/ui/routes';

import { artboardLabel } from './artboard-label';

/** The props of {@link Artboard}. */
export interface ArtboardProps {
  readonly entry: CatalogEntry;
  readonly maze: Maze;
  /** Where it lies in the world. */
  readonly place: WorldRect;
  /** The thumbnail band its size on screen needs. */
  readonly band: ThumbnailBand;
  /** Whether it fades out and leaves the keyboard and the pointer, as while a maze is open. */
  readonly hidden?: boolean;
  readonly onFocus: (key: string, event: FocusEvent<HTMLAnchorElement>) => void;
}

function artboardStyle(place: WorldRect): CSSProperties & Record<'--bw', number> {
  return {
    transform: `translate(${place.x}px, ${place.y}px)`,
    width: place.width,
    height: place.height,
    '--bw': place.width,
  };
}

/**
 * One maze on the library's canvas (DESIGN.md 7): a link that opens it, its thumbnail, and its
 * name and size above at a constant 12 px whatever the zoom. Hover and keyboard focus ring it.
 * A new place slides there, so a reflow moves the artboards that stay mounted. A plain click pushes
 * the route at once, so the maze opens in the next frame; a modified one opens a new tab. The link
 * is not draggable, so a drag that starts on it pans the canvas.
 */
export const Artboard = memo(function Artboard({
  entry,
  maze,
  place,
  band,
  hidden = false,
  onFocus,
}: ArtboardProps) {
  return (
    <a
      aria-label={artboardLabel(entry)}
      aria-hidden={hidden || undefined}
      className="group absolute top-0 left-0 block text-inherit no-underline outline-none transition-[transform,opacity] duration-[360ms,320ms] ease-(--ease-out) data-hidden:pointer-events-none data-hidden:opacity-0"
      data-hidden={hidden ? '' : undefined}
      draggable={false}
      tabIndex={hidden ? -1 : undefined}
      data-artboard={entry.key}
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
      style={artboardStyle(place)}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-full left-0 flex w-[calc(var(--bw)*var(--k)*1px)] origin-bottom-left scale-(--ik) items-baseline gap-2 pb-[7px] text-xs leading-4 whitespace-nowrap text-muted-foreground"
      >
        <b className="min-w-0 truncate font-medium text-foreground" translate="no">
          {entry.name}
        </b>
        <span className="ml-auto flex-none font-mono tabular-nums">
          {entry.width} × {entry.height}
        </span>
      </span>
      <ThumbnailCanvas
        className="rounded-[calc(4px*var(--ik))] bg-[oklch(0.17_0_0)] shadow-artboard outline-ring group-hover:outline-[calc(2px*var(--ik))] group-hover:outline-offset-[calc(3px*var(--ik))] group-hover:outline-solid group-focus-visible:outline-[calc(2px*var(--ik))] group-focus-visible:outline-offset-[calc(3px*var(--ik))] group-focus-visible:outline-solid"
        height={place.height}
        maze={maze}
        resolution={band}
        width={place.width}
      />
    </a>
  );
});
