import { useEffect, useState, type ReactNode } from 'react';

import { encodeMazeCode, type Maze } from '@/maze';
import { ThumbnailCanvas } from '@/ui/board/thumbnail-canvas';
import { Check, Eye, GitDiff, Trash, X } from '@/ui/icons';
import { IslandButton } from '@/ui/islands/island';
import { Popover, PopoverAnchor, PopoverContent } from '@/ui/primitives/popover';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/ui/primitives/sheet';
import { cn } from '@/ui/primitives/utils';

import { changeDiff, changeSummary, type ChangeItem } from './session-changes';

/** How long Discard stays armed for its second click (DESIGN.md 6). */
export const DISCARD_ARMED_MS = 3000;

/** The side of a row's thumbnail, in CSS pixels. */
const ROW_THUMBNAIL = 56;

/** An item of the panel and its maze as it is now, when it can be read. */
export interface ChangeRow {
  readonly item: ChangeItem;
  readonly current: Maze | undefined;
}

/** The props of {@link ChangesChip}. */
export interface ChangesChipProps {
  readonly count: number;
  readonly open: boolean;
  readonly onToggle: () => void;
}

/**
 * The Changes chip (DESIGN.md 6 and 13): "N changed", named "Changes in this session: N"; hidden
 * while the session has no changes.
 */
export function ChangesChip({ count, open, onToggle }: ChangesChipProps) {
  if (count === 0) {
    return null;
  }

  return (
    <IslandButton
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label={`Changes in this session: ${count}`}
      data-changes-chip=""
      onClick={onToggle}
    >
      <GitDiff aria-hidden className="text-[var(--diff-ink)]" size={16} />
      <span aria-hidden>{count} changed</span>
    </IslandButton>
  );
}

interface DiscardButtonProps {
  readonly name: string;
  readonly onDiscard: () => void;
}

/**
 * Discard in two clicks (DESIGN.md 6): the first arms it for 3 s, in the destructive fill, and the
 * second discards.
 */
function DiscardButton({ name, onDiscard }: DiscardButtonProps) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) {
      return undefined;
    }

    const timer = window.setTimeout(() => setArmed(false), DISCARD_ARMED_MS);
    return () => window.clearTimeout(timer);
  }, [armed]);

  return (
    <IslandButton
      aria-label={armed ? `Confirm discard of ${name}` : `Discard ${name}`}
      className={cn(
        'h-8 min-w-8 px-2 text-xs',
        armed && 'bg-destructive text-white hover:bg-destructive/90'
      )}
      data-armed={armed ? '' : undefined}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onDiscard();
        } else {
          setArmed(true);
        }
      }}
    >
      <Trash aria-hidden size={14} />
      {armed ? 'Confirm' : 'Discard'}
    </IslandButton>
  );
}

interface RowProps {
  readonly row: ChangeRow;
  readonly onOpen: (item: ChangeItem) => void;
  readonly onKeep: (item: ChangeItem) => void;
  readonly onDiscard: (item: ChangeItem) => void;
}

function Row({ row, onOpen, onKeep, onDiscard }: RowProps) {
  const { item, current } = row;
  const diff = current === undefined ? undefined : changeDiff(item, current);

  return (
    <li className="flex items-center gap-3 rounded-[10px] px-2 py-2" data-change={item.id}>
      <span className="size-14 flex-none overflow-hidden rounded-[5px] bg-[oklch(0.17_0_0)]">
        {current === undefined ? null : (
          <ThumbnailCanvas
            height={ROW_THUMBNAIL}
            maze={current}
            width={ROW_THUMBNAIL}
            {...(diff === undefined || item.baseline === undefined
              ? {}
              : { diff: { diff, key: encodeMazeCode(item.baseline) } })}
          />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <b className="truncate text-[13px] font-medium" translate="no">
          {item.name}
        </b>
        <small className="truncate text-xs text-muted-foreground" data-summary="">
          {current === undefined ? 'Not readable' : changeSummary(item, current)}
        </small>
        <span className="mt-1 flex gap-1">
          <IslandButton
            aria-label={`Open ${item.name}`}
            className="h-8 px-2 text-xs"
            onClick={() => onOpen(item)}
          >
            Open
          </IslandButton>
          <IslandButton
            aria-label={`Keep ${item.name}`}
            className="h-8 px-2 text-xs"
            onClick={() => onKeep(item)}
          >
            <Check aria-hidden size={14} />
            Keep
          </IslandButton>
          <DiscardButton name={item.name} onDiscard={() => onDiscard(item)} />
        </span>
      </span>
    </li>
  );
}

/** The props of {@link ChangesPanel}. */
export interface ChangesPanelProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly rows: readonly ChangeRow[];
  readonly phone: boolean;
  /** Whether the open maze has a diff to show on the board. */
  readonly canShowDiff: boolean;
  readonly showDiff: boolean;
  readonly onShowDiff: (show: boolean) => void;
  readonly onOpenItem: (item: ChangeItem) => void;
  readonly onKeep: (item: ChangeItem) => void;
  readonly onDiscard: (item: ChangeItem) => void;
}

function Body({
  rows,
  canShowDiff,
  showDiff,
  onShowDiff,
  onOpenItem,
  onKeep,
  onDiscard,
  onOpenChange,
  heading,
}: Omit<ChangesPanelProps, 'open' | 'phone'> & { readonly heading: ReactNode }) {
  return (
    <>
      <div className="flex items-center gap-2 pt-2.5 pr-2 pb-1.5 pl-4">
        {heading}
        <IslandButton aria-label="Close changes" onClick={() => onOpenChange(false)}>
          <X aria-hidden size={16} />
        </IslandButton>
      </div>
      <div className="mx-3 mb-1 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex flex-1 items-center gap-1.5">
          <i
            aria-hidden
            className="size-3 rounded-[3px] border border-[var(--diff-ink)] bg-[var(--diff-ink)]/20"
          />
          Put
          <i
            aria-hidden
            className="ml-2 size-3 rounded-[3px] border border-dashed border-[var(--diff-ink)]"
          />
          Taken
        </span>
        <IslandButton
          aria-pressed={showDiff}
          className="h-8 px-2 text-xs aria-pressed:bg-muted"
          disabled={!canShowDiff}
          onClick={() => onShowDiff(!showDiff)}
        >
          <Eye aria-hidden size={14} />
          Show on board
          <kbd className="font-mono text-[11px] text-muted-foreground">D</kbd>
        </IslandButton>
      </div>
      <ul className="min-h-0 flex-1 overflow-auto overscroll-contain px-2 pt-1 pb-2.5">
        {rows.length === 0 ? (
          <li className="px-2 py-3 text-[13px] text-muted-foreground">
            Nothing changed since the app opened.
          </li>
        ) : (
          rows.map((row) => (
            <Row
              key={row.item.id}
              onDiscard={onDiscard}
              onKeep={onKeep}
              onOpen={onOpenItem}
              row={row}
            />
          ))
        )}
      </ul>
    </>
  );
}

/**
 * The Changes panel (DESIGN.md 6 and 6.2): the mazes created or edited in Mine in this session,
 * each with its thumbnail and the diff on it, what changed, and Open, Keep and Discard; and "Show
 * on board", which `D` toggles too. A popover under the islands at the top right on a notebook, a
 * sheet on a phone.
 */
export function ChangesPanel({ open, onOpenChange, phone, ...body }: ChangesPanelProps) {
  if (phone) {
    return (
      <Sheet onOpenChange={onOpenChange} open={open}>
        <SheetContent className="max-h-[62dvh]">
          <Body
            {...body}
            heading={<SheetTitle className="flex-1 text-sm">Changes in this session</SheetTitle>}
            onOpenChange={onOpenChange}
          />
          <SheetDescription className="sr-only">
            The mazes created or edited in Mine since the app opened.
          </SheetDescription>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover modal={false} onOpenChange={onOpenChange} open={open}>
      <PopoverAnchor className="pointer-events-none fixed top-[64px] right-4 size-px" />
      <PopoverContent
        align="end"
        aria-label="Changes in this session"
        className="flex max-h-[calc(100dvh-160px)] w-[380px] flex-col overflow-hidden"
        onInteractOutside={(event) => {
          if (event.target instanceof Element && event.target.closest('[data-changes-chip]')) {
            event.preventDefault();
          }
        }}
        sideOffset={0}
      >
        <Body
          {...body}
          heading={
            <h2 className="flex-1 text-sm leading-5 font-semibold">Changes in this session</h2>
          }
          onOpenChange={onOpenChange}
        />
      </PopoverContent>
    </Popover>
  );
}
