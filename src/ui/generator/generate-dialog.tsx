import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import { BATCH, readRecipe, resize } from '@/generator';
import type { Maze } from '@/maze';
import type { LoadingTrack } from '@/render/loading';
import type { Generated } from '@/ui/editor/edit-session';
import { RoutesButton } from '@/ui/editor/routes-panel';
import { useCoarsePointer, usePhoneLayout } from '@/ui/hooks/use-media-query';
import { CANVAS_ID } from '@/ui/canvas-id';
import { CaretDown, CaretLeft, CaretRight, Check, DiceFive, GearSix, Shuffle, X } from '@/ui/icons';
import { IslandButton } from '@/ui/islands/island';
import type { NewMazeRequest } from '@/ui/new-maze';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@/ui/primitives/sheet';
import { cn } from '@/ui/primitives/utils';
import { appStorage } from '@/ui/storage';

import { Batch, MAX_ITEMS, randomSeed, type Item } from './batch-run';
import {
  generatesFor,
  isReady,
  measureItem,
  replacesBoard,
  requestOf,
  statusLine,
  stepTo,
  STOPPED,
  unsupportedBoard,
  pickHint,
  type ReadyItem,
} from './candidates';
import { Card } from './gallery-card';
import { DetailView } from './detail-view';
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
   *
   * @returns Whether the board took it, which a read-only board does not.
   */
  readonly onReplace?: (generated: Generated) => boolean;
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

/** What the footer says on the last maze of a full batch. */
const FULL = `A batch holds ${MAX_ITEMS} mazes: start a new batch from the settings`;

const NOT_A_RECIPE = 'This is not a recipe: copy it again with “Copy recipe”';

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
  const canMore = !running && items.length > 0 && index === items.length - 1 && batch.roomForMore;
  const full = !running && items.length > 0 && !batch.roomForMore;

  const more = (): void => {
    const [first] = batch.generate(structuredClone(state.settings ?? choice.settings), false);
    setSelected(first?.n);
  };

  const step = (delta: -1 | 1): void => {
    const next = delta < 0 ? backward : forward;

    if (next !== undefined) {
      setSelected(items[next]?.n);
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
    setSelected(n);
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
      onOpenChange(false);

      if (onReplace !== undefined && !freshMaze && replacesBoard(current, board)) {
        if (onReplace({ maze: measureItem(current).maze, recipe: current.recipe })) {
          batch.use(current.n);
        }
        return;
      }

      batch.use(current.n);
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
          disabled={running}
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
          <span className="ml-auto flex items-center gap-2">
            {docked ? null : <RoutesButton phone={phone} />}
            {settingsOpen ? null : (
              <IslandButton aria-label="Settings" onClick={() => openSettings(true)} ref={gear}>
                <GearSix aria-hidden size={16} />
              </IslandButton>
            )}
          </span>
          <SheetClose asChild>
            <IslandButton aria-label="Close">
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
