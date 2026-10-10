import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import type { CatalogEntry } from '@/library';
import { ThumbnailCanvas } from '@/ui/board/thumbnail-canvas';
import { useInView } from '@/ui/hooks/use-in-view';
import { categoryLabel, sizeLabel } from '@/ui/labels';
import type { Library } from '@/ui/library/use-library';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/ui/primitives/command';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/ui/primitives/sheet';

import { MAZE_LIST_ID } from './editor-chrome';
import { listOrder, steppedKey } from './list-order';

/** The side of a row's thumbnail, in CSS pixels. */
const ROW_THUMBNAIL = 36;

/** The props of {@link MazeList}. */
export interface MazeListProps {
  readonly library: Library;
  /** The catalog key of the maze on screen, which the list highlights. */
  readonly current: string | undefined;
  readonly phone: boolean;
  /** Shows a maze on the board without pinning it. */
  readonly onPreview: (key: string) => void;
  /** Pins a maze, changing the route, and closes the list. */
  readonly onPin: (key: string) => void;
  /** Closes the list and puts back the maze that was pinned. */
  readonly onCancel: () => void;
}

interface RowProps {
  readonly entry: CatalogEntry;
  readonly library: Library;
  readonly root: Element | null;
}

function Row({ entry, library, root }: RowProps) {
  const thumbnail = useRef<HTMLSpanElement>(null);
  const seen = useInView(thumbnail, root);
  const maze = seen ? library.mazeOf(entry.key) : undefined;

  return (
    <>
      <span
        className="size-9 flex-none overflow-hidden rounded-[5px] bg-[oklch(0.17_0_0)]"
        ref={thumbnail}
      >
        {maze === undefined ? null : (
          <ThumbnailCanvas height={ROW_THUMBNAIL} maze={maze} width={ROW_THUMBNAIL} />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <b className="truncate text-[13px] font-medium" translate="no">
          {entry.name}
        </b>
        <small className="truncate text-[11px] text-muted-foreground">
          {entry.origin === 'mine' ? 'Mine' : (entry.competition ?? categoryLabel(entry.category))}
        </small>
      </span>
      <span className="flex-none font-mono text-[11px] text-muted-foreground tabular-nums">
        {sizeLabel(entry.width, entry.height)}
      </span>
    </>
  );
}

interface ItemsProps {
  readonly entries: readonly CatalogEntry[];
  readonly library: Library;
  readonly root: Element | null;
  readonly onPin: (key: string) => void;
}

/**
 * The rows of the list. Memoised with a stable `onPin`, so moving the highlight re-renders only
 * the rows cmdk marks selected or no longer selected, not the hundreds of others.
 */
const Items = memo(function Items({ entries, library, root, onPin }: ItemsProps) {
  return entries.map((entry) => (
    <CommandItem
      className="gap-2.5 rounded-[9px] px-2 py-1.5 [contain-intrinsic-size:auto_48px] [content-visibility:auto]"
      key={entry.key}
      onSelect={() => onPin(entry.key)}
      value={entry.key}
    >
      <Row entry={entry} library={library} root={root} />
    </CommandItem>
  ));
});

/**
 * The quick maze list (PLAN.md 3.4, DESIGN.md 6): Mine first, then the repository, filtered by
 * the library's own search. Moving the highlight with the arrows, or with `[` and `]`, which never
 * reach the filter, previews that maze in place; Enter or a click pins it and closes; Esc puts
 * back the pinned one and closes. A drawer at the left on a notebook, with the filter focused; a
 * sheet on a phone, where the list itself takes the focus, so the arrows work and the on-screen
 * keyboard does not cover the list until the filter is tapped. Row thumbnails are drawn as they scroll into view.
 */
export function MazeList({ library, current, phone, onPreview, onPin, onCancel }: MazeListProps) {
  const [query, setQuery] = useState('');
  const [list, setList] = useState<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const commandRoot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!phone) {
      input.current?.focus({ preventScroll: true });
    }
  }, [phone]);
  const entries = library.index.search(listOrder(library.entries), query);
  const keys = entries.map((entry) => entry.key);
  const handlers = useRef({ onPin });

  useLayoutEffect(() => {
    handlers.current = { onPin };
  });

  const pin = useCallback((key: string) => handlers.current.onPin(key), []);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === '[' || event.key === ']') {
      event.preventDefault();
      const next = steppedKey(keys, current, event.key === ']' ? 1 : -1);

      if (next !== undefined) {
        onPreview(next);
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  };

  const command = (
    <Command
      className="h-full bg-transparent outline-none"
      label="Maze list"
      onValueChange={(key) => {
        if (keys.includes(key)) {
          onPreview(key);
        }
      }}
      ref={commandRoot}
      shouldFilter={false}
      tabIndex={-1}
      value={current ?? ''}
    >
      <CommandInput
        onKeyDown={onKeyDown}
        onValueChange={setQuery}
        placeholder="Filter mazes…"
        ref={input}
        value={query}
      />
      <CommandList className="max-h-none flex-1 p-1" ref={setList}>
        <CommandEmpty>No maze matches</CommandEmpty>
        <Items entries={entries} library={library} onPin={pin} root={list} />
      </CommandList>
    </Command>
  );

  if (phone) {
    return (
      <Sheet
        onOpenChange={(open) => {
          if (!open) {
            onCancel();
          }
        }}
        open
      >
        <SheetContent
          className="h-[62dvh]"
          id={MAZE_LIST_ID}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            commandRoot.current?.focus({ preventScroll: true });
          }}
        >
          <SheetTitle className="sr-only">Maze list</SheetTitle>
          <SheetDescription className="sr-only">
            Highlight a maze to preview it, Enter to keep it, Escape to go back.
          </SheetDescription>
          {command}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      aria-label="Maze list"
      className="fixed top-safe-[72px] bottom-safe-4 left-safe-4 z-[15] flex w-[320px] flex-col overflow-hidden rounded-[16px] bg-card shadow-island motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-3.5 motion-safe:duration-240 motion-safe:ease-(--ease-drawer)"
      id={MAZE_LIST_ID}
    >
      {command}
    </aside>
  );
}
