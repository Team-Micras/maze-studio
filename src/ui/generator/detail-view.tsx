import { useEffect, useLayoutEffect, useRef, useState, type Ref } from 'react';

import type { LoadingTrack } from '@/render/loading';
import { Board } from '@/ui/board/board';
import { copyText } from '@/ui/editor/share';
import { Copy, Warning } from '@/ui/icons';
import { Button } from '@/ui/primitives/button';
import { shownOverlays, useOverlaySwitches } from '@/ui/route-switches';
import { showToast } from '@/ui/toasts';

import type { Item } from './batch-run';
import {
  elapsedText,
  isReady,
  itemFeatures,
  itemOrigin,
  itemTags,
  itemTitle,
  itemWarning,
  measureItem,
  phaseText,
  swipeStep,
  type ReadyItem,
} from './candidates';
import { InUse } from './gallery-card';
import { LoadingCanvas } from './loading-canvas';

/** How often, in milliseconds, the title line of a maze building reads what it is at. */
const PHASE_READ = 200;

function CopyRecipe({ item }: { item: ReadyItem }) {
  return (
    <Button
      aria-label="Copy recipe"
      className="size-7 rounded-[8px]"
      onClick={() => {
        void copyText(JSON.stringify(item.recipe)).then((copied) =>
          showToast(copied ? 'Recipe copied' : 'Copy failed')
        );
      }}
      size="icon"
      type="button"
      variant="outline"
    >
      <Copy aria-hidden />
    </Button>
  );
}

/** `read` of what `track` returns, read again a few times a second. */
function useTrackText(
  track: () => LoadingTrack,
  read: (track: LoadingTrack, now: number) => string
): string {
  const latest = useRef(track);
  const [text, setText] = useState(() => read(track(), performance.now()));

  useLayoutEffect(() => {
    latest.current = track;
  });

  useEffect(() => {
    const timer = setInterval(() => setText(read(latest.current(), performance.now())), PHASE_READ);
    return () => clearInterval(timer);
  }, [read]);

  return text;
}

/**
 * What a maze still building is at, under a band of light that sweeps it so a long stage still
 * shows it works; plain under reduced motion.
 */
function PhaseText({ track }: { track: () => LoadingTrack }) {
  return <span className="text-shimmer">{useTrackText(track, phaseText)}</span>;
}

/** For how long a maze has been building, at the end of its title line where Copy recipe comes. */
function Elapsed({ track }: { track: () => LoadingTrack }) {
  return (
    <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
      {useTrackText(track, elapsedText)}
    </span>
  );
}

/** The line that names a maze: "#4 of 8 · seed 4004890115 · Diagonal staircases". */
function MazeTitle({
  item,
  place,
  total,
  headingRef,
  track,
}: {
  item: Item;
  place: number;
  total: number;
  headingRef?: Ref<HTMLHeadingElement>;
  track: () => LoadingTrack;
}) {
  return (
    <h3
      className="min-w-0 flex-1 truncate text-[13px] leading-5 font-semibold outline-none"
      id={`maze-${item.n}`}
      ref={headingRef}
      tabIndex={-1}
    >
      {itemTitle(place, total)}
      <span className="font-normal text-muted-foreground">
        {' · '}
        {isReady(item) ? (
          itemOrigin(item)
        ) : item.status !== 'pending' ? (
          'The generator could not make this maze'
        ) : (
          <PhaseText key={item.n} track={track} />
        )}
      </span>
    </h3>
  );
}

/**
 * A maze's title line, and once it is built Copy recipe, its tags and its sentences, the Off target
 * one first. The title stays the same element as the maze gets built, so focus on it stays too.
 */
function Details({
  item,
  place,
  total,
  used,
  headingRef,
  track,
}: {
  item: Item;
  place: number;
  total: number;
  used: boolean;
  headingRef?: Ref<HTMLHeadingElement>;
  track: () => LoadingTrack;
}) {
  const ready = isReady(item);
  const warning = ready ? itemWarning(item) : undefined;
  const tags = ready ? itemTags(item) : [];

  return (
    <section aria-labelledby={`maze-${item.n}`} className="flex flex-col gap-1.5">
      <div className="flex min-h-7 items-center gap-2">
        <MazeTitle headingRef={headingRef} item={item} place={place} total={total} track={track} />
        {used ? <InUse /> : null}
        {ready ? (
          <CopyRecipe item={item} />
        ) : item.status === 'pending' ? (
          <Elapsed key={item.n} track={track} />
        ) : null}
      </div>
      {tags.length === 0 ? null : (
        <ul aria-label="This maze has" className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <li className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] leading-none" key={tag}>
              {tag}
            </li>
          ))}
        </ul>
      )}
      {!ready ? null : (
        <ul className="flex list-disc flex-col gap-0.5 pl-4 text-xs leading-4">
          {warning === undefined ? null : (
            <li className="-ml-4 flex list-none items-start gap-1 text-amber-700 dark:text-amber-400">
              <Warning aria-hidden className="shrink-0" size={14} />
              {warning}
            </li>
          )}
          {itemFeatures(item).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The props of {@link DetailView}. */
interface DetailViewProps {
  readonly items: readonly Item[];
  readonly index: number;
  /** The `n` of the maze picked with Use this. */
  readonly used: number | undefined;
  /** Draws the maze large; not beside the editor, whose own board shows it. */
  readonly withBoard: boolean;
  readonly headingRef: Ref<HTMLHeadingElement>;
  /** What the maze numbered `n` has shown of its progress. */
  readonly track: (n: number) => LoadingTrack;
  /** Steps to the maze before (-1) or after (1), as a swipe asks. */
  readonly onSwipe: (delta: -1 | 1) => void;
}

/**
 * The maze opened from the gallery, a view pushed over it: drawn large with the routes the session
 * shows, unless the editor's board shows it, then its title line with Copy recipe, its tags and
 * its sentences. A swipe steps.
 */
export function DetailView({
  items,
  index,
  used,
  withBoard,
  headingRef,
  track,
  onSwipe,
}: DetailViewProps) {
  const start = useRef<{ x: number; y: number } | undefined>(undefined);
  const switches = useOverlaySwitches();
  const item = items[index];

  if (item === undefined) {
    return null;
  }

  return (
    <div
      className="flex touch-pan-y touch-pinch-zoom flex-col gap-2"
      data-detail
      onPointerDown={(event) => {
        start.current =
          event.pointerType === 'mouse' ? undefined : { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        const from = start.current;
        start.current = undefined;
        const delta =
          from === undefined ? 0 : swipeStep(event.clientX - from.x, event.clientY - from.y);

        if (delta !== 0) {
          onSwipe(delta);
        }
      }}
    >
      {!withBoard ? null : isReady(item) ? (
        <div className="relative" key={item.n}>
          <Board
            className="h-auto w-full"
            label={`Maze #${index + 1}, seed ${item.seed}`}
            maze={measureItem(item).maze}
            overlays={shownOverlays(measureItem(item).maze, switches)}
          />
          {item.builtAt === undefined ? null : (
            <LoadingCanvas
              builtAt={item.builtAt}
              className="absolute inset-0 w-full"
              scale="board"
              size={item.size}
              track={() => track(item.n)}
            />
          )}
        </div>
      ) : item.status === 'pending' ? (
        <div aria-busy key={item.n}>
          <LoadingCanvas
            className="w-full"
            scale="board"
            size={item.size}
            track={() => track(item.n)}
          />
        </div>
      ) : (
        <div className="aspect-square w-full rounded-[6px] bg-muted" />
      )}
      <Details
        headingRef={headingRef}
        item={item}
        place={index + 1}
        total={items.length}
        track={() => track(item.n)}
        used={item.n === used}
      />
    </div>
  );
}
