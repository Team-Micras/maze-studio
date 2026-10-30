import { memo, useEffect, useRef, type CSSProperties, type FocusEvent } from 'react';

import type { CatalogEntry } from '@/library';
import type { Maze } from '@/maze';
import type { ThumbnailBand } from '@/render';
import { ThumbnailCanvas } from '@/ui/board/thumbnail-canvas';
import { Check } from '@/ui/icons';
import { artboardLabel } from '@/ui/labels';
import { cn } from '@/ui/primitives/utils';
import { pushRoute } from '@/ui/navigation';

import { libraryFlung } from './library-scroller';
import { routeHash, routeOfEntry } from '@/ui/routes';

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
  /** Whether it is hidden, while the board flies from or onto it. */
  readonly concealed?: boolean;
  /** Starts selecting with this artboard, after a press held; absent where nothing can be selected. */
  readonly onHold?: (key: string) => void;
  /** Whether the library is selecting, where a click or a tap toggles instead of opening. */
  readonly selecting?: boolean;
  readonly selected?: boolean;
  readonly onToggle?: (key: string) => void;
  readonly onFocus: (key: string, event: FocusEvent<HTMLAnchorElement>) => void;
}

/** How long after a touch opened the maze its click may still come, to be ignored. */
const CLICK_AFTER_TOUCH_MS = 400;

/** How far a finger may move, in CSS pixels, and still open the artboard it lifts from. */
const TOUCH_SLOP = 10;

/** How long a press is held, in milliseconds, before it starts selecting. */
const HOLD_MS = 500;

function artboardStyle(
  x: number,
  y: number,
  width: number,
  height: number,
  concealed: boolean
): CSSProperties {
  return {
    transform: `translate(${x}px, ${y}px)`,
    width,
    height,
    opacity: concealed ? 0 : undefined,
  };
}

/**
 * One maze of the library's grid (DESIGN.md 7): a link that opens it, its thumbnail, the
 * generator's skeleton until that is painted, and its name and size above. Hover and keyboard focus
 * ring it. A new place slides there, so a reflow moves the artboards that stay mounted. A plain
 * click pushes the route at once, so the maze opens in the next frame; a modified one opens a new
 * tab. The link is not draggable, and a finger held on it opens no menu and selects nothing: held,
 * it stays put; lifted without moving, even after a long press, it opens the maze; moved, it
 * scrolls the grid.
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
  concealed = false,
  onHold,
  selecting = false,
  selected = false,
  onToggle,
  onFocus,
}: ArtboardProps) {
  const press = useRef<{ readonly id: number; readonly x: number; readonly y: number } | undefined>(
    undefined
  );
  const openedByTouch = useRef(false);
  const hold = useRef<{ readonly timer: number; readonly x: number; readonly y: number }>(
    undefined
  );
  const held = useRef(false);
  const letGo = (): void => {
    window.clearTimeout(hold.current?.timer);
    hold.current = undefined;
  };
  useEffect(() => () => window.clearTimeout(hold.current?.timer), []);

  const activate = (): void => {
    if (selecting) {
      onToggle?.(entry.key);
    } else {
      pushRoute(routeOfEntry(entry));
    }
  };

  return (
    <a
      aria-checked={selecting ? selected : undefined}
      aria-label={artboardLabel(entry)}
      className="group absolute top-0 left-0 block text-inherit no-underline outline-none transition-transform duration-[360ms] ease-(--ease-out) select-none [-webkit-touch-callout:none]"
      data-artboard={entry.key}
      draggable={false}
      href={routeHash(routeOfEntry(entry))}
      onClick={(event) => {
        if (openedByTouch.current || held.current) {
          openedByTouch.current = false;
          held.current = false;
          event.preventDefault();
          return;
        }

        if (selecting) {
          event.preventDefault();
          onToggle?.(entry.key);
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
      onKeyDown={(event) => {
        if (event.key !== ' ') {
          return;
        }

        if (selecting) {
          event.preventDefault();
          onToggle?.(entry.key);
        } else if (event.shiftKey && onHold !== undefined) {
          event.preventDefault();
          onHold(entry.key);
        }
      }}
      onPointerLeave={letGo}
      onPointerCancel={() => {
        press.current = undefined;
        letGo();
      }}
      onPointerDown={(event) => {
        openedByTouch.current = false;
        held.current = false;
        letGo();

        if (onHold !== undefined && !selecting && event.button === 0) {
          hold.current = {
            x: event.clientX,
            y: event.clientY,
            timer: window.setTimeout(() => {
              held.current = true;
              hold.current = undefined;
              onHold(entry.key);
            }, HOLD_MS),
          };
        }

        press.current =
          event.pointerType === 'touch'
            ? { id: event.pointerId, x: event.clientX, y: event.clientY }
            : undefined;
      }}
      onPointerMove={(event) => {
        const start = press.current;
        const holding = hold.current;

        if (
          holding !== undefined &&
          Math.hypot(event.clientX - holding.x, event.clientY - holding.y) > TOUCH_SLOP
        ) {
          letGo();
        }

        if (
          start !== undefined &&
          Math.hypot(event.clientX - start.x, event.clientY - start.y) > TOUCH_SLOP
        ) {
          press.current = undefined;
        }
      }}
      onPointerUp={(event) => {
        letGo();

        if (press.current?.id === event.pointerId) {
          press.current = undefined;
          openedByTouch.current = true;
          window.setTimeout(() => {
            openedByTouch.current = false;
          }, CLICK_AFTER_TOUCH_MS);

          if (held.current) {
            held.current = false;
          } else {
            activate();
          }
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
      role={selecting ? 'checkbox' : undefined}
      style={artboardStyle(x, y, width, height, concealed)}
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
        className={cn(
          'rounded-[4px] bg-[oklch(0.17_0_0)] bg-[length:100%_100%] shadow-artboard outline-ring group-hover:outline-2 group-hover:outline-offset-[3px] group-hover:outline-solid group-focus-visible:outline-2 group-focus-visible:outline-offset-[3px] group-focus-visible:outline-solid',
          entry.width > 16
            ? 'bg-(image:--thumbnail-skeleton-32)'
            : 'bg-(image:--thumbnail-skeleton-16)',
          selected && 'outline-2 outline-offset-[3px] outline-solid'
        )}
        eachFrame
        flung={libraryFlung}
        height={height}
        maze={maze}
        resolution={band}
        width={width}
      />
      {selected ? (
        <span className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground shadow-island">
          <Check aria-hidden size={14} />
        </span>
      ) : null}
    </a>
  );
});
