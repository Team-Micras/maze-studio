import { useCallback, useEffect, useState, type FocusEvent } from 'react';

import { mineIdOf, type CatalogEntry } from '@/library';
import {
  libraryLayout,
  libraryRect,
  mountedRows,
  revealScroll,
  rowOf,
  thumbnailBand,
  type LibraryLayout,
  type RowRange,
} from '@/render';
import { useDevicePixelRatio } from '@/ui/board/use-device-pixel-ratio';
import { Island, IslandButton } from '@/ui/islands/island';
import { cn } from '@/ui/primitives/utils';

import { Artboard } from './artboard';
import type { Library } from './use-library';

/** The props of {@link LibraryGrid}. */
export interface LibraryGridProps {
  readonly library: Library;
  /** The entries shown, in grid order. */
  readonly entries: readonly CatalogEntry[];
  readonly phone: boolean;
  /** Whether the grid fades out and leaves the keyboard and the pointer, as while a maze is open. */
  readonly hidden: boolean;
  /** The artboard the board flies from or onto, hidden until the board gives way to it. */
  readonly inFlight?: string | undefined;
  /** Deletes mazes of My mazes by id; given only where the grid shows My mazes, which a held press then selects. */
  readonly onDelete?: ((ids: readonly string[]) => void) | undefined;
  /** Hands on the kind of pointer that pressed the grid, and the key of the artboard pressed. */
  readonly onArtboardPointer?: (pointerType: string, key: string | undefined) => void;
}

/** How far a key scrolls the grid, as it would scroll a page; `undefined` for other keys. */
function keyScroll(key: string, shiftKey: boolean, scroller: HTMLElement): number | undefined {
  const page = scroller.clientHeight * 0.9;

  switch (key) {
    case 'PageDown':
      return page;
    case 'PageUp':
      return -page;
    case ' ':
      return shiftKey ? -page : page;
    case 'ArrowDown':
      return 40;
    case 'ArrowUp':
      return -40;
    case 'Home':
      return -scroller.scrollTop;
    case 'End':
      return scroller.scrollHeight;
    default:
      return undefined;
  }
}

/** What the grid lays out and mounts for the scroller as it is now. */
interface View {
  readonly width: number;
  readonly rows: RowRange;
}

function viewOf(scroller: HTMLElement, layout: (width: number) => LibraryLayout): View {
  return {
    width: scroller.clientWidth,
    rows: mountedRows(layout(scroller.clientWidth), scroller.scrollTop, scroller.clientHeight),
  };
}

function sameView(left: View, right: View): boolean {
  return (
    left.width === right.width &&
    left.rows.first === right.rows.first &&
    left.rows.last === right.rows.last
  );
}

/**
 * The library as a grid of artboards (PLAN.md 3.4, DESIGN.md 7) in an element that fills the
 * screen and that the browser scrolls, with its own momentum on a phone; its columns follow its
 * width. Only the rows on screen and one more above and below are mounted, and the artboard with
 * the keyboard's focus never leaves; Tab onto an artboard under an island scrolls it into the room
 * between them. While a maze is open the grid fades out, keeping where it was scrolled to.
 */
export function LibraryGrid({
  library,
  entries,
  phone,
  hidden,
  inFlight,
  onDelete,
  onArtboardPointer,
}: LibraryGridProps) {
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const [view, setView] = useState<View>({ width: 0, rows: { first: 0, last: -1 } });
  const [focused, setFocused] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<ReadonlySet<string> | undefined>(undefined);
  const [armed, setArmed] = useState(false);
  const selecting = selected !== undefined;

  if (selecting && (onDelete === undefined || hidden)) {
    setSelected(undefined);
  }

  const hold = useCallback((key: string) => {
    setSelected(new Set([key]));
    setArmed(false);
  }, []);
  const toggle = useCallback((key: string) => {
    setArmed(false);
    setSelected((before) => {
      const next = new Set(before);

      if (!next.delete(key)) {
        next.add(key);
      }

      return next;
    });
  }, []);
  const stopSelecting = (): void => {
    setSelected(undefined);
    setArmed(false);
  };

  useEffect(() => {
    if (!selecting) {
      return undefined;
    }

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setSelected(undefined);
        setArmed(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selecting]);
  const ratio = useDevicePixelRatio();
  const count = entries.length;
  const layout = libraryLayout(view.width, phone ? 'phone' : 'notebook', count);
  const band = thumbnailBand(layout.side * ratio);

  useEffect(() => {
    if (scroller === null) {
      return undefined;
    }

    let frame = 0;
    const layoutFor = (width: number): LibraryLayout =>
      libraryLayout(width, phone ? 'phone' : 'notebook', count);
    const update = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        setView((before) => {
          const next = viewOf(scroller, layoutFor);
          return sameView(before, next) ? before : next;
        })
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    scroller.addEventListener('scroll', update, { passive: true });
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scroller.removeEventListener('scroll', update);
    };
  }, [scroller, phone, count]);

  useEffect(() => {
    if (scroller === null || hidden) {
      return undefined;
    }

    const onKey = (event: KeyboardEvent): void => {
      const active = document.activeElement;

      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (active !== null && active !== document.body)
      ) {
        return;
      }

      const by = keyScroll(event.key, event.shiftKey, scroller);

      if (by !== undefined) {
        event.preventDefault();
        scroller.scrollBy({ top: by });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scroller, hidden]);

  const reveal = useCallback(
    (key: string, event: FocusEvent<HTMLAnchorElement>): void => {
      setFocused(key);

      if (scroller === null || !event.target.matches(':focus-visible')) {
        return;
      }

      const box = event.currentTarget.getBoundingClientRect();
      const top = revealScroll(
        { y: box.top + scroller.scrollTop, height: box.height },
        scroller.scrollTop,
        scroller.clientHeight,
        layout.insets
      );

      if (top !== scroller.scrollTop) {
        scroller.scrollTo({ top, behavior: 'instant' });
      }
    },
    [scroller, layout.insets]
  );

  const mounted =
    view.width === 0
      ? []
      : entries.flatMap((entry, index) => {
          const row = rowOf(index, layout);

          if ((row < view.rows.first || row > view.rows.last) && entry.key !== focused) {
            return [];
          }

          const maze = library.mazeOf(entry.key);
          return maze === undefined
            ? []
            : [{ entry, maze, rect: libraryRect(layout, index, maze) }];
        });

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 overflow-x-hidden overflow-y-auto overscroll-y-contain transition-opacity duration-200 ease-(--ease)',
          hidden && 'pointer-events-none opacity-0'
        )}
        data-hidden={hidden ? '' : undefined}
        data-library-scroller=""
        inert={hidden}
        ref={setScroller}
      >
        <section
          aria-label="Maze library"
          className="relative"
          data-library-grid=""
          style={{ height: layout.height }}
        >
          <div
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setFocused(undefined);
              }
            }}
            onPointerDownCapture={(event) =>
              onArtboardPointer?.(
                event.pointerType,
                event.target instanceof Element
                  ? (event.target.closest('a[data-artboard]')?.getAttribute('data-artboard') ??
                      undefined)
                  : undefined
              )
            }
          >
            {mounted.map(({ entry, maze, rect }) => (
              <Artboard
                band={band}
                concealed={entry.key === inFlight}
                entry={entry}
                height={rect.height}
                key={entry.key}
                maze={maze}
                onFocus={reveal}
                onHold={onDelete === undefined ? undefined : hold}
                onToggle={toggle}
                selected={selected?.has(entry.key) === true}
                selecting={selecting}
                slot={layout.side}
                width={rect.width}
                x={rect.x}
                y={rect.y}
              />
            ))}
          </div>
        </section>
      </div>
      {selected === undefined || onDelete === undefined ? null : (
        <Island
          aria-label="Selection"
          className="fixed bottom-safe-6 left-1/2 z-20 h-11 -translate-x-1/2 gap-1 pl-3 text-[13px]"
          role="toolbar"
        >
          <span aria-live="polite" className="pr-2 tabular-nums">
            {selected.size} selected
          </span>
          <IslandButton
            className={cn(
              armed &&
                'bg-destructive text-destructive-foreground hover:bg-destructive hover:text-destructive-foreground'
            )}
            disabled={selected.size === 0}
            onClick={() => {
              if (!armed) {
                setArmed(true);
                return;
              }

              onDelete([...selected].flatMap((key) => mineIdOf(key) ?? []));
              stopSelecting();
            }}
          >
            {armed ? 'Confirm delete' : 'Delete'}
          </IslandButton>
          <IslandButton onClick={stopSelecting}>Cancel</IslandButton>
        </Island>
      )}
    </>
  );
}
