import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
  type Ref,
} from 'react';

import { BATCH, readRecipe, resize } from '@/generator';
import type { Maze } from '@/maze';
import { SETTLE, type LoadingTrack } from '@/render/loading';
import type { Generated } from '@/ui/editor/edit-session';
import { ThumbnailCanvas } from '@/ui/board/thumbnail-canvas';
import { copyText } from '@/ui/editor/share';
import { useCoarsePointer, usePhoneLayout } from '@/ui/hooks/use-media-query';
import { Board } from '@/ui/board/board';
import { CANVAS_ID } from '@/ui/canvas-id';
import {
  CaretDown,
  CaretLeft,
  CaretRight,
  Check,
  Copy,
  DiceFive,
  GearSix,
  Shuffle,
  Warning,
  X,
} from '@/ui/icons';
import { IslandButton } from '@/ui/islands/island';
import type { NewMazeRequest } from '@/ui/new-maze';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@/ui/primitives/sheet';
import { cn } from '@/ui/primitives/utils';
import { appStorage } from '@/ui/storage';
import { showToast } from '@/ui/toasts';

import { Batch, MAX_ITEMS, randomSeed, type Item } from './batch-run';
import {
  cardLabel,
  generatesFor,
  isReady,
  itemFeatures,
  itemOrigin,
  itemTags,
  itemTitle,
  elapsedText,
  phaseText,
  itemWarning,
  measureItem,
  replacesBoard,
  requestOf,
  statusLine,
  stepTo,
  STOPPED,
  swipeStep,
  unsupportedBoard,
  pickHint,
  type ReadyItem,
} from './candidates';
import { LoadingCanvas } from './loading-canvas';

export { LoadingCanvas };
import { SettingsForm, type GeneratorChoice } from './settings-form';
import { startingSettings, summary } from './settings-model';

/**
 * The maze the editor's board previews: the one picked once it is built, else the last one built
 * before it, of the board's size unless the board is a new maze not yet edited.
 */
function previewOf(
  items: readonly Item[],
  index: number,
  board: Maze | undefined,
  fresh: boolean
): ReadyItem | undefined {
  const fits = (item: Item): item is ReadyItem =>
    isReady(item) && (fresh || replacesBoard(item, board));
  return items.slice(0, index + 1).findLast(fits) ?? items.find(fits);
}

/** The settings sized for the board open in the editor, when the generator makes its size. */
function fitted(choice: GeneratorChoice, board: Maze | undefined): GeneratorChoice {
  return board !== undefined && generatesFor(board) && board.width !== choice.settings.size
    ? {
        ...choice,
        settings: structuredClone(resize(choice.settings, board.width === 32 ? 32 : 16)),
      }
    : choice;
}

/** The batch every Generate dialog of the app shows, kept in memory for the session. */
const appBatch = new Batch();

/** The props of {@link GenerateDialog}. */
export interface GenerateDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Opens the maze picked in the editor, as a new maze. */
  readonly onUse: (request: NewMazeRequest) => void;
  /** The maze open in the editor, when Generate opens from there. */
  readonly board?: Maze;
  /**
   * Puts the maze picked on the board in place of the open one, as one step of undo; only for a
   * maze of the board's size.
   */
  readonly onReplace?: (generated: Generated) => void;
  /**
   * Whether the open maze is a new maze not yet edited, which the maze picked takes the place of as
   * a new maze of its own, with its name and recipe.
   */
  readonly fresh?: boolean;
  /**
   * Shows the candidate picked, or the last one built, on the editor's board while the panel is
   * open, and nothing once it closes. With it the panel is not modal: the board stays in reach.
   */
  readonly onPreview?: (preview: GeneratorPreview | undefined) => void;
  /** The batch it shows and builds; the one the whole app shares by default. */
  readonly batch?: Batch;
}

/**
 * A candidate the editor's board shows while the panel is open: its maze and seed once built, and
 * until then its progress, which the board animates.
 */
export interface GeneratorPreview {
  readonly n: number;
  readonly size: 16 | 32;
  readonly maze?: Maze;
  readonly seed?: number;
  readonly track: () => LoadingTrack;
  /** When it was built, for the skeleton to fade into it. */
  readonly builtAt?: number;
}

const CARD_SIDE = 156;

/** How often, in milliseconds, the title line of a maze building reads what it is at. */
const PHASE_READ = 200;

/** How far apart, in milliseconds, the waves of two cards in a row run. */
const WAVE_STAGGER = 537;

/** What the footer says on the last maze of a full batch. */
const FULL = `A batch holds ${MAX_ITEMS} mazes: start a new batch from the settings`;

const NOT_A_RECIPE = 'This is not a recipe: copy it again with “Copy recipe”';

/**
 * A ready card's thumbnail; the first time a maze shows after it was built, painted at once rather
 * than in idle time, under the skeleton that fades into it.
 */
function CardPicture({ item, place }: { item: ReadyItem; place: number }) {
  const [settling] = useState(
    () => item.builtAt !== undefined && performance.now() - item.builtAt < SETTLE
  );

  return (
    <span className="relative self-center">
      <ThumbnailCanvas
        cached={!settling}
        height={CARD_SIDE}
        maze={measureItem(item).maze}
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

function Card({
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
function InUse() {
  return <Badge className="ml-1 px-1.5 py-0.5 text-[11px] leading-none">In use</Badge>;
}

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
 * The maze opened from the gallery, a view pushed over it: drawn large unless the editor's board
 * shows it, then its title line with Copy recipe, its tags and its sentences. A swipe steps.
 */
function DetailView({
  items,
  index,
  used,
  withBoard,
  headingRef,
  track,
  onSwipe,
}: DetailViewProps) {
  const start = useRef<{ x: number; y: number } | undefined>(undefined);
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

/**
 * The Generate dialog (beta) of New maze and of the editor, in its own chunk with the generator:
 * the settings (kept on the device), the first seed, Generate and Rebuild from a recipe, as a view
 * of their own behind the gear; the gallery of the batch's mazes, which fill in as they are built,
 * under a status row, and 8 more at its end, up to 64; and the maze a card opens, in a
 * view pushed over the gallery with a footer of ‹ Use this ›, where › past the last maze builds 8
 * more. A docked panel on a notebook, the whole screen on a phone. Closing stops the run on its
 * way; the batch stays for the session, and opening on it shows the gallery as the last batch, with
 * New batch, and the maze used marked In use. A rebuilt recipe starts a batch of its own.
 */
export default function GenerateDialog({
  open,
  onOpenChange,
  onUse,
  board,
  onReplace,
  fresh: freshMaze = false,
  onPreview,
  batch = appBatch,
}: GenerateDialogProps) {
  const id = useId();
  const phone = usePhoneLayout();
  const coarse = useCoarsePointer();
  const content = useRef<HTMLDivElement>(null);
  const generateButton = useRef<HTMLButtonElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const state = useSyncExternalStore(batch.subscribe, batch.getState);
  const [choice, setChoice] = useState<GeneratorChoice>(() => startingSettings(undefined));
  const [touched, setTouched] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  const [openedOn, setOpenedOn] = useState<readonly Item[] | undefined>(undefined);
  const boardNow = useRef(board);

  useLayoutEffect(() => {
    boardNow.current = board;
  });
  const [invalid, setInvalid] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const gear = useRef<HTMLButtonElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const [selected, setSelected] = useState<number | undefined>(undefined);
  const [detail, setDetail] = useState(false);
  const [hovered, setHovered] = useState<number | undefined>(undefined);
  const [lastOpened, setLastOpened] = useState<number | undefined>(undefined);
  const heading = useRef<HTMLHeadingElement>(null);
  const galleryScroll = useRef(0);
  const [seedText, setSeedText] = useState<string | undefined>(undefined);
  const [recipeText, setRecipeText] = useState('');
  const [recipeError, setRecipeError] = useState<string | undefined>(undefined);
  const items = state.items;
  const current = items.find((item) => item.n === selected) ?? items[0];
  const index = current === undefined ? 0 : items.indexOf(current);
  const running = state.progress !== null;
  const last = !running && items.length > 0 && items === openedOn;
  const hint = pickHint(current, freshMaze ? undefined : board);

  const docked = onPreview !== undefined && board !== undefined;
  const hoveredItem = detail || settingsOpen ? undefined : items.find((item) => item.n === hovered);
  const previewed =
    isReady(hoveredItem) && (freshMaze || replacesBoard(hoveredItem, board))
      ? hoveredItem
      : current?.status === 'pending' && (freshMaze || current.size === board?.width)
        ? current
        : previewOf(items, index, board, freshMaze);

  useEffect(() => {
    onPreview?.(
      open && previewed !== undefined
        ? {
            n: previewed.n,
            size: previewed.size,
            track: () => batch.track(previewed.n),
            builtAt: previewed.builtAt,
            ...(isReady(previewed)
              ? { maze: measureItem(previewed).maze, seed: previewed.seed }
              : {}),
          }
        : undefined
    );
  }, [open, previewed, onPreview, batch]);

  useEffect(() => {
    let live = true;
    void appStorage()
      .then((storage) => storage?.settings.generator())
      .then(
        (saved) => {
          if (live && !touched && saved !== undefined) {
            setChoice(fitted(startingSettings(saved), boardNow.current));
          }
        },
        () => undefined
      );
    return () => {
      live = false;
    };
  }, [touched]);

  if (open !== wasOpen) {
    setWasOpen(open);
    setHovered(undefined);
    setOpenedOn(open ? items : undefined);

    if (open) {
      setChoice(fitted(choice, board));
    }

    if (open && items.length > 0) {
      setSettingsOpen(false);
      setDetail(false);
    }
  }

  useEffect(() => (open ? () => batch.cancel() : undefined), [open, batch]);

  const changeSettings = (next: GeneratorChoice): void => {
    setTouched(true);
    setChoice(next);
    void appStorage()
      .then((storage) =>
        storage?.settings.saveGenerator({ preset: next.preset.id, settings: next.settings })
      )
      .catch(() => undefined);
  };

  const forward = stepTo(items, index, 1);
  const backward = stepTo(items, index, -1);
  const canMore =
    !running && !invalid && items.length > 0 && index === items.length - 1 && batch.roomForMore;
  const full = !running && items.length > 0 && !batch.roomForMore;

  const more = (): void => {
    const [first] = batch.generate(structuredClone(state.settings ?? choice.settings), false);
    setSelected(first?.n);
  };

  const pick = (n: number | undefined): void => {
    setSelected(n);
  };

  const step = (delta: -1 | 1): void => {
    const next = delta < 0 ? backward : forward;

    if (next !== undefined) {
      pick(items[next]?.n);
    } else if (delta > 0 && canMore) {
      more();
    }
  };

  const stepKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    const delta = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    const { target } = event;

    if (
      !detail ||
      settingsOpen ||
      delta === 0 ||
      (target instanceof HTMLElement &&
        target.closest('input, textarea, select, [role="radiogroup"]') !== null)
    ) {
      return;
    }

    event.preventDefault();
    step(delta);
  };

  const openSettings = (opened: boolean): void => {
    setSettingsOpen(opened);
    body.current?.scrollTo({ top: 0 });

    if (!opened) {
      setInvalid(false);
      requestAnimationFrame(() =>
        (detail ? heading.current : gear.current)?.focus({ preventScroll: true })
      );
    } else {
      requestAnimationFrame(() => back.current?.focus({ preventScroll: true }));
    }
  };

  const openDetail = (n: number): void => {
    galleryScroll.current = body.current?.scrollTop ?? 0;
    pick(n);
    setHovered(undefined);
    setDetail(true);
    requestAnimationFrame(() => {
      body.current?.scrollTo({ top: 0 });
      heading.current?.focus({ preventScroll: true });
    });
  };

  const closeDetail = (): void => {
    const opened = current?.n;
    setHovered(undefined);
    setLastOpened(opened);
    setDetail(false);
    requestAnimationFrame(() => {
      body.current?.scrollTo({ top: galleryScroll.current });
      const card = content.current?.querySelector<HTMLElement>(`[data-card="${opened ?? ''}"]`);
      card?.scrollIntoView({ block: 'nearest' });
      card?.focus({ preventScroll: true });
    });
  };

  const showResults = (n: number | undefined): void => {
    setSelected(n);
    setLastOpened(undefined);
    setDetail(false);
    setSettingsOpen(false);
    setInvalid(false);
    requestAnimationFrame(() => {
      body.current?.scrollTo({ top: 0 });
      status.current?.focus({ preventScroll: true });
    });
  };

  const generate = (): void => {
    if (!invalid) {
      showResults(batch.generate(structuredClone(choice.settings), true)[0]?.n);
    }
  };

  const rebuild = (): void => {
    try {
      const item = batch.rebuild(readRecipe(recipeText), choice.settings);
      setRecipeError(undefined);
      setSettingsOpen(false);
      setInvalid(false);
      body.current?.scrollTo({ top: 0 });
      openDetail(item.n);
    } catch {
      setRecipeError(NOT_A_RECIPE);
    }
  };

  const use = (): void => {
    if (isReady(current)) {
      batch.use(current.n);
      onOpenChange(false);

      if (onReplace !== undefined && !freshMaze && replacesBoard(current, board)) {
        onReplace({ maze: measureItem(current).maze, recipe: current.recipe });
        return;
      }

      onUse(requestOf(current));
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    generate();
  };

  const settingsView = (
    <form className="flex flex-col gap-4" data-settings onSubmit={submit}>
      <SettingsForm onChange={changeSettings} onInvalid={setInvalid} value={choice} />
      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] leading-none font-medium" htmlFor={`${id}-seed`}>
          First seed
        </label>
        <div className="flex gap-2">
          <Input
            autoComplete="off"
            className="h-8 min-w-[13ch] font-mono text-[13px]"
            id={`${id}-seed`}
            inputMode="numeric"
            max={batch.maxSeed}
            min={0}
            onBlur={() => setSeedText(undefined)}
            onChange={(event) => {
              const text = event.target.value;
              setSeedText(text);

              if (text.trim() !== '') {
                batch.setNextSeed(Number(text));
              }
            }}
            type="number"
            value={seedText ?? state.nextSeed}
          />
          <Button
            aria-label="Random seed"
            className="size-8 rounded-[10px]"
            onClick={() => {
              setSeedText(undefined);
              batch.setNextSeed(randomSeed(batch.maxSeed));
            }}
            size="icon"
            type="button"
            variant="outline"
          >
            <DiceFive aria-hidden />
          </Button>
        </div>
      </div>
      <Button className="h-10 rounded-[10px]" disabled={invalid} ref={generateButton} type="submit">
        <Shuffle aria-hidden />
        Generate
      </Button>
      <details className="group/recipe">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-[8px] text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <b className="font-semibold">Rebuild from a recipe</b>
          <CaretDown
            aria-hidden
            className="transition-transform group-open/recipe:rotate-180"
            size={14}
          />
        </summary>
        <div className="flex flex-col gap-2 pt-2">
          <label className="sr-only" htmlFor={`${id}-recipe`}>
            Recipe
          </label>
          <textarea
            aria-describedby={recipeError === undefined ? undefined : `${id}-recipe-error`}
            aria-invalid={recipeError !== undefined}
            autoComplete="off"
            className="min-h-16 rounded-md border border-input bg-transparent px-2 py-1.5 font-mono text-xs shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30"
            id={`${id}-recipe`}
            onChange={(event) => setRecipeText(event.target.value)}
            placeholder='{"settings":{…},"seed":1234}'
            rows={3}
            spellCheck={false}
            value={recipeText}
          />
          {recipeError === undefined ? null : (
            <p className="text-xs text-destructive" id={`${id}-recipe-error`} role="alert">
              {recipeError}
            </p>
          )}
          <Button
            className="self-start rounded-[10px]"
            onClick={rebuild}
            type="button"
            variant="outline"
          >
            Rebuild
          </Button>
        </div>
      </details>
    </form>
  );

  const galleryView = (
    <>
      {items.length === 0 ? (
        <div className="flex flex-col items-start gap-3 py-2">
          <p className="text-[13px] text-muted-foreground">
            {summary(choice.settings, choice.preset)}
          </p>
          <Button className="rounded-[10px]" disabled={invalid} onClick={generate} type="button">
            <Shuffle aria-hidden />
            Generate
          </Button>
        </div>
      ) : null}
      <div className="flex h-9 shrink-0 items-center gap-2" data-status-row>
        <p
          className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground outline-none"
          ref={status}
          tabIndex={-1}
          title={state.stopped ? STOPPED : undefined}
        >
          {statusLine(state, last)}
          {state.stopped && !running ? ' · some not made' : ''}
        </p>
        <p aria-live="polite" className="sr-only">
          {running
            ? 'Building mazes…'
            : `${statusLine(state, last)}${state.stopped ? `. ${STOPPED}` : ''}`}
        </p>
        {last ? (
          <Button
            className="rounded-[10px]"
            disabled={invalid}
            onClick={generate}
            size="sm"
            type="button"
          >
            <Shuffle aria-hidden />
            New batch
          </Button>
        ) : null}
      </div>
      {items.length === 0 ? null : (
        <ol aria-label="Mazes generated" className="grid grid-cols-2 gap-2">
          {items.map((item, k) => (
            <Card
              marked={item.n === lastOpened}
              item={item}
              used={item.n === state.used}
              key={item.n}
              onHover={(over) => setHovered(over ? item.n : undefined)}
              onPick={() => openDetail(item.n)}
              place={k + 1}
            />
          ))}
        </ol>
      )}
      {items.length > 0 && !batch.roomForMore ? (
        <p className="text-xs text-muted-foreground">{FULL}</p>
      ) : null}
      {items.length === 0 || !batch.roomForMore ? null : (
        <Button
          className="self-start rounded-[10px]"
          disabled={invalid || running}
          onClick={more}
          type="button"
          variant="outline"
        >
          <Shuffle aria-hidden />
          {BATCH} more
        </Button>
      )}
    </>
  );

  const detailView = (
    <DetailView
      headingRef={heading}
      index={index}
      items={items}
      onSwipe={step}
      track={batch.track}
      used={state.used}
      withBoard={!docked}
    />
  );

  return (
    <Sheet modal={!docked} onOpenChange={onOpenChange} open={open}>
      <SheetContent
        aria-describedby={undefined}
        className={cn('gap-0', phone && 'top-0 h-dvh rounded-none pt-[env(safe-area-inset-top)]')}
        data-generate
        onKeyDown={stepKey}
        onEscapeKeyDown={(event) => {
          if (settingsOpen && items.length > 0) {
            event.preventDefault();
            openSettings(false);
          } else if (detail && !settingsOpen) {
            event.preventDefault();
            closeDetail();
          }
        }}
        onInteractOutside={(event) => {
          if (docked) {
            event.preventDefault();
          }
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (coarse ? content.current : (generateButton.current ?? gear.current))?.focus({
            preventScroll: true,
          });
        }}
        ref={content}
        side={phone ? 'bottom' : 'right'}
        tabIndex={-1}
      >
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          {settingsOpen || detail ? (
            <IslandButton
              aria-label="Back to the mazes"
              onClick={() => (settingsOpen ? openSettings(false) : closeDetail())}
              ref={back}
            >
              <CaretLeft aria-hidden size={16} />
            </IslandButton>
          ) : null}
          <SheetTitle className="text-[15px]">Generate</SheetTitle>
          <Badge variant="secondary">Beta</Badge>
          {settingsOpen ? (
            <span className="text-[13px] text-muted-foreground">Settings</span>
          ) : null}
          {docked ? (
            <button
              className="sr-only rounded-[8px] px-2 py-1 text-xs focus:not-sr-only focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => document.getElementById(CANVAS_ID)?.focus()}
              type="button"
            >
              Back to the board
            </button>
          ) : null}
          {settingsOpen ? null : (
            <IslandButton
              aria-label="Settings"
              className="ml-auto"
              onClick={() => openSettings(true)}
              ref={gear}
            >
              <GearSix aria-hidden size={16} />
            </IslandButton>
          )}
          <SheetClose asChild>
            <IslandButton aria-label="Close" className={settingsOpen ? 'ml-auto' : undefined}>
              <X aria-hidden size={16} />
            </IslandButton>
          </SheetClose>
        </div>
        <div
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-4 pb-3"
          ref={body}
        >
          {board === undefined || generatesFor(board) ? null : (
            <p className="text-xs text-amber-700 dark:text-amber-400">{unsupportedBoard(board)}</p>
          )}
          {settingsOpen ? settingsView : detail ? detailView : galleryView}
        </div>
        {settingsOpen || !detail || items.length === 0 ? null : (
          <div className="relative z-10 flex flex-col gap-1 border-t bg-card px-4 pt-2 pb-3">
            {full && index === items.length - 1 ? (
              <p className="text-xs text-muted-foreground">{FULL}</p>
            ) : hint === undefined ? null : (
              <p className="text-xs text-muted-foreground">{hint}</p>
            )}
            <div className="flex items-center gap-2">
              <Button
                aria-keyshortcuts="ArrowLeft"
                aria-label="Previous maze"
                className="size-10 rounded-[10px]"
                disabled={backward === undefined}
                onClick={() => step(-1)}
                size="icon"
                type="button"
                variant="outline"
              >
                <CaretLeft aria-hidden />
              </Button>
              <Button
                className="h-10 flex-1 rounded-[10px]"
                disabled={!isReady(current)}
                onClick={use}
                type="button"
              >
                <Check aria-hidden />
                Use this
              </Button>
              <Button
                aria-keyshortcuts="ArrowRight"
                aria-label={
                  forward === undefined && canMore
                    ? `Next maze, building ${BATCH} more`
                    : 'Next maze'
                }
                className="size-10 rounded-[10px]"
                disabled={forward === undefined && !canMore}
                onClick={() => step(1)}
                size="icon"
                type="button"
                variant="outline"
              >
                <CaretRight aria-hidden />
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
