import { useState } from 'react';

import { SETTLE } from '@/render/loading';
import { ThumbnailCanvas } from '@/ui/board/thumbnail-canvas';
import { Warning } from '@/ui/icons';
import { Badge } from '@/ui/primitives/badge';
import { cn } from '@/ui/primitives/utils';
import { useOverlaySwitches } from '@/ui/route-switches';

import type { Item } from './batch-run';
import {
  cardLabel,
  isReady,
  itemTags,
  itemWarning,
  measureItem,
  type ReadyItem,
} from './candidates';
import { LoadingCanvas } from './loading-canvas';

const CARD_SIDE = 156;

/** How far apart, in milliseconds, the waves of two cards in a row run. */
const WAVE_STAGGER = 537;

/**
 * A ready card's thumbnail, with the routes the session shows; the first time a maze shows after
 * it was built, painted at once rather than in idle time, under the skeleton that fades into it.
 */
function CardPicture({ item, place }: { item: ReadyItem; place: number }) {
  const overlays = useOverlaySwitches();
  const [settling] = useState(
    () => item.builtAt !== undefined && performance.now() - item.builtAt < SETTLE
  );

  return (
    <span className="relative self-center">
      <ThumbnailCanvas
        cached={!settling}
        height={CARD_SIDE}
        maze={measureItem(item).maze}
        overlays={overlays}
        width={CARD_SIDE}
      />
      {settling ? (
        <LoadingCanvas
          builtAt={item.builtAt}
          className="absolute inset-0"
          offset={place * WAVE_STAGGER}
          scale="thumbnail"
          size={item.size}
          style={{ width: CARD_SIDE, height: CARD_SIDE }}
        />
      ) : null}
    </span>
  );
}

/**
 * A maze of the gallery: building, not made, or its picture, number, length and tags; a button that
 * opens it.
 */
export function Card({
  item,
  place,
  marked,
  used,
  onPick,
  onHover,
}: {
  item: Item;
  place: number;
  /** Whether it is the card last opened, which the gallery marks on the way back. */
  marked: boolean;
  /** Whether it is the maze picked with Use this. */
  used: boolean;
  onPick: () => void;
  /** Called with `true` as the pointer comes over the card, and `false` as it leaves. */
  onHover: (over: boolean) => void;
}) {
  if (item.status === 'pending') {
    return (
      <li>
        <button
          aria-busy
          aria-label={`#${place}, building`}
          className={cn(
            'flex w-full flex-col items-start gap-1.5 rounded-[12px] p-1.5 text-left text-xs text-muted-foreground ring-offset-background outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
            marked && 'bg-accent'
          )}
          data-card={item.n}
          onClick={onPick}
          type="button"
        >
          <LoadingCanvas
            className="self-center"
            offset={place * WAVE_STAGGER}
            scale="thumbnail"
            size={item.size}
            style={{ width: CARD_SIDE, height: CARD_SIDE }}
          />
          <span>#{place}</span>
        </button>
      </li>
    );
  }

  if (!isReady(item)) {
    return (
      <li>
        <div className="flex flex-col gap-1.5 rounded-[12px] p-1.5 text-xs text-muted-foreground">
          <div className="aspect-square w-full rounded-[6px] bg-muted" />
          <span>#{place}, not made</span>
        </div>
      </li>
    );
  }

  const tags = itemTags(item);
  const warning = itemWarning(item);

  return (
    <li>
      <button
        aria-label={cardLabel(item, place, used)}
        data-card={item.n}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        className={cn(
          'flex w-full flex-col items-start gap-1.5 rounded-[12px] p-1.5 text-left text-xs ring-offset-background outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
          marked && 'bg-accent'
        )}
        onClick={onPick}
        type="button"
      >
        <CardPicture item={item} place={place} />
        <span className="flex items-center gap-1">
          {warning === undefined ? null : (
            <span className="inline-flex" title={warning}>
              <Warning aria-hidden className="text-amber-600 dark:text-amber-400" size={14} />
            </span>
          )}
          <b className="font-semibold">#{place}</b> ·{' '}
          <span className="font-mono">{measureItem(item).analysis.shortest}</span> cells
          {used ? <InUse /> : null}
        </span>
        {tags.length === 0 ? null : (
          <span className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span
                className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] leading-none"
                key={tag}
              >
                {tag}
              </span>
            ))}
          </span>
        )}
      </button>
    </li>
  );
}

/** The tag of the maze picked with Use this. */
export function InUse() {
  return <Badge className="ml-1 px-1.5 py-0.5 text-[11px] leading-none">In use</Badge>;
}
