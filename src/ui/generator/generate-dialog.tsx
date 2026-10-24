import { useEffect, useId, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';

import { BATCH, readRecipe, resize } from '@/generator';
import type { Maze } from '@/maze';
import type { Generated } from '@/ui/editor/edit-session';
import { ThumbnailCanvas } from '@/ui/board/thumbnail-canvas';
import { copyText } from '@/ui/editor/share';
import { useCoarsePointer, usePhoneLayout } from '@/ui/hooks/use-media-query';
import { CaretDown, Check, Copy, DiceFive, Shuffle, Warning, X } from '@/ui/icons';
import { IslandButton } from '@/ui/islands/island';
import type { NewMazeRequest } from '@/ui/new-maze';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { Sheet, SheetClose, SheetContent, SheetTitle } from '@/ui/primitives/sheet';
import { cn } from '@/ui/primitives/utils';
import { appStorage } from '@/ui/storage';
import { showToast } from '@/ui/toasts';

import { Batch, type Item } from './batch-run';
import {
  cardLabel,
  generatesFor,
  isReady,
  itemFeatures,
  itemOrigin,
  itemTags,
  itemTitle,
  itemWarning,
  measureItem,
  replacesBoard,
  requestOf,
  statusLine,
  STOPPED,
  unsupportedBoard,
  pickHint,
  type ReadyItem,
} from './candidates';
import { SettingsForm, type GeneratorChoice } from './settings-form';
import { startingSettings, summary } from './settings-model';

/** The settings sized for the board open in the editor, when the generator makes its size. */
function fitted(choice: GeneratorChoice, board: Maze | undefined): GeneratorChoice {
  return board !== undefined && generatesFor(board) && board.width !== choice.settings.size
    ? {
        ...choice,
        settings: structuredClone(resize(choice.settings, board.width === 32 ? 32 : 16)),
      }
    : choice;
}

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
}

const CARD_SIDE = 156;

const NOT_A_RECIPE = 'This is not a recipe: copy it again with “Copy recipe”';

function Card({ item, current, onPick }: { item: Item; current: boolean; onPick: () => void }) {
  if (!isReady(item)) {
    return (
      <li>
        <div
          aria-busy={item.status === 'pending'}
          className="flex flex-col gap-1.5 rounded-[12px] p-1.5 text-xs text-muted-foreground"
        >
          <div
            className={cn(
              'aspect-square w-full rounded-[6px] bg-muted',
              item.status === 'pending' && 'animate-pulse'
            )}
          />
          <span>
            #{item.n}
            {item.status === 'failed' ? ', not made' : ''}
          </span>
        </div>
      </li>
    );
  }

  const tags = itemTags(item);
  const warning = itemWarning(item);

  return (
    <li>
      <button
        aria-label={cardLabel(item)}
        aria-pressed={current}
        className={cn(
          'flex w-full flex-col items-start gap-1.5 rounded-[12px] p-1.5 text-left text-xs ring-offset-background outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
          current && 'ring-2 ring-foreground'
        )}
        onClick={onPick}
        type="button"
      >
        <ThumbnailCanvas
          className="self-center rounded-[4px]"
          height={CARD_SIDE}
          maze={measureItem(item).maze}
          width={CARD_SIDE}
        />
        <span className="flex items-center gap-1">
          {warning === undefined ? null : (
            <Warning aria-hidden className="text-amber-600 dark:text-amber-400" size={14} />
          )}
          <b className="font-semibold">#{item.n}</b> ·{' '}
          <span className="font-mono">{measureItem(item).analysis.shortest}</span> cells
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

function Details({ item, total }: { item: ReadyItem; total: number }) {
  const warning = itemWarning(item);
  const tags = itemTags(item);

  return (
    <section
      aria-labelledby={`maze-${item.n}`}
      className="flex flex-col gap-2 rounded-[12px] border p-3"
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="text-[14px] font-semibold" id={`maze-${item.n}`}>
            {itemTitle(item, total)}
          </h3>
          <p className="font-mono text-xs text-muted-foreground">{itemOrigin(item)}</p>
        </div>
        <Button
          aria-label="Copy recipe"
          className="size-8 rounded-[10px]"
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
      </div>
      {tags.length === 0 ? null : (
        <ul aria-label="This maze has" className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <li className="rounded-full bg-muted px-2 py-0.5 text-xs" key={tag}>
              {tag}
            </li>
          ))}
        </ul>
      )}
      <ul className="flex list-disc flex-col gap-1 pl-4 text-[13px] leading-5">
        {warning === undefined ? null : (
          <li className="-ml-4 flex list-none items-start gap-1.5 text-amber-700 dark:text-amber-400">
            <Warning aria-hidden className="mt-0.5 shrink-0" size={16} />
            {warning}
          </li>
        )}
        {itemFeatures(item).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The Generate dialog of New maze (beta), in its own chunk with the generator: the settings
 * (kept on the device), the first seed and Generate, and Rebuild from a recipe; then the batch's
 * progress with Cancel, its mazes as cards with their tags, the details of the one picked, and Use
 * this, which opens it in the editor as a new maze with its recipe. A docked panel on a notebook,
 * a sheet on a phone. Closing keeps the batch for the next time and stops the run on its way.
 */
export default function GenerateDialog({
  open,
  onOpenChange,
  onUse,
  board,
  onReplace,
}: GenerateDialogProps) {
  const id = useId();
  const phone = usePhoneLayout();
  const coarse = useCoarsePointer();
  const content = useRef<HTMLDivElement>(null);
  const generateButton = useRef<HTMLButtonElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const [batch] = useState(() => new Batch());
  const state = useSyncExternalStore(batch.subscribe, batch.getState);
  const [choice, setChoice] = useState<GeneratorChoice>(() => startingSettings(undefined));
  const [touched, setTouched] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [selected, setSelected] = useState<number | undefined>(undefined);
  const [recipeText, setRecipeText] = useState('');
  const [recipeError, setRecipeError] = useState<string | undefined>(undefined);
  const items = state.items;
  const current = items.find((item) => item.n === selected);
  const running = state.progress !== null;
  const hint = pickHint(current, board);

  useEffect(() => {
    let live = true;
    void appStorage()
      .then((storage) => storage?.settings.generator())
      .then(
        (saved) => {
          if (live && !touched && saved !== undefined) {
            setChoice(fitted(startingSettings(saved), board));
          }
        },
        () => undefined
      );
    return () => {
      live = false;
    };
  }, [touched, board]);

  if (open !== wasOpen) {
    setWasOpen(open);

    if (open) {
      setChoice(fitted(choice, board));
    }
  }

  useEffect(() => {
    if (!open) {
      batch.cancel();
    }
  }, [open, batch]);

  const changeSettings = (next: GeneratorChoice): void => {
    setTouched(true);
    setChoice(next);
    void appStorage()
      .then((storage) =>
        storage?.settings.saveGenerator({ preset: next.preset.id, settings: next.settings })
      )
      .catch(() => undefined);
  };

  const showResults = (n: number | undefined): void => {
    setSelected(n);
    setSettingsOpen(false);
    body.current?.scrollTo({ top: 0 });
    status.current?.focus({ preventScroll: true });
  };

  const generate = (fresh: boolean): void => {
    if (!invalid) {
      showResults(batch.generate(structuredClone(choice.settings), fresh)[0]?.n);
    }
  };

  const rebuild = (): void => {
    try {
      const item = batch.rebuild(readRecipe(recipeText), choice.settings);
      setRecipeError(undefined);
      showResults(item.n);
    } catch {
      setRecipeError(NOT_A_RECIPE);
    }
  };

  const use = (): void => {
    if (isReady(current)) {
      onOpenChange(false);

      if (onReplace !== undefined && replacesBoard(current, board)) {
        onReplace({ maze: measureItem(current).maze, recipe: current.recipe });
        return;
      }

      onUse(requestOf(current));
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    generate(true);
  };

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        aria-describedby={undefined}
        className={cn('gap-0', phone && 'h-[92dvh]')}
        data-generate
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (coarse ? content.current : generateButton.current)?.focus({ preventScroll: true });
        }}
        ref={content}
        side={phone ? 'bottom' : 'right'}
        tabIndex={-1}
      >
        <div className="flex items-center gap-2 px-4 pt-4 pb-3">
          <SheetTitle className="text-[15px]">Generate</SheetTitle>
          <Badge variant="secondary">Beta</Badge>
          <SheetClose asChild>
            <IslandButton aria-label="Close" className="ml-auto">
              <X aria-hidden size={16} />
            </IslandButton>
          </SheetClose>
        </div>
        <div
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-4"
          ref={body}
        >
          {board === undefined || generatesFor(board) ? null : (
            <p className="text-xs text-amber-700 dark:text-amber-400">{unsupportedBoard(board)}</p>
          )}
          <details
            className="group rounded-[12px] border"
            onToggle={(event) => setSettingsOpen(event.currentTarget.open)}
            open={settingsOpen}
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-[12px] px-3 py-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <b className="font-semibold">Settings</b>
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                {summary(choice.settings, choice.preset)}
              </span>
              <CaretDown
                aria-hidden
                className="ml-auto shrink-0 transition-transform group-open:rotate-180"
                size={14}
              />
            </summary>
            <form className="flex flex-col gap-4 px-3 pt-1 pb-3" onSubmit={submit}>
              <SettingsForm onChange={changeSettings} onInvalid={setInvalid} value={choice} />
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] leading-none font-medium" htmlFor={`${id}-seed`}>
                  First seed
                </label>
                <div className="flex gap-2">
                  <Input
                    autoComplete="off"
                    className="h-8 font-mono text-[13px]"
                    id={`${id}-seed`}
                    inputMode="numeric"
                    max={batch.maxSeed}
                    min={0}
                    onChange={(event) => batch.setNextSeed(Number(event.target.value))}
                    type="number"
                    value={state.nextSeed}
                  />
                  <Button
                    aria-label="Random seed"
                    className="size-8 rounded-[10px]"
                    onClick={() => batch.setNextSeed(1 + Math.floor(Math.random() * 99_999))}
                    size="icon"
                    type="button"
                    variant="outline"
                  >
                    <DiceFive aria-hidden />
                  </Button>
                </div>
              </div>
              <Button
                className="h-10 rounded-[10px]"
                disabled={invalid}
                ref={generateButton}
                type="submit"
              >
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
          </details>
          <div className="flex items-center gap-2">
            <p
              className="min-w-0 flex-1 font-mono text-xs text-muted-foreground outline-none"
              ref={status}
              tabIndex={-1}
            >
              {statusLine(state)}
            </p>
            <p aria-live="polite" className="sr-only">
              {running ? 'Generating…' : statusLine(state)}
            </p>
            {running ? (
              <Button
                className="h-7 rounded-[8px] text-xs"
                onClick={() => batch.cancel()}
                size="sm"
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
            ) : null}
          </div>
          {state.progress === null ? null : (
            <progress
              aria-label="Generating"
              className="h-1 w-full appearance-none overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary"
              max={state.progress.total}
              value={state.progress.done}
            />
          )}
          {state.stopped ? (
            <p className="text-xs text-destructive" role="alert">
              {STOPPED}
            </p>
          ) : null}
          {items.length === 0 ? null : (
            <ol aria-label="Mazes generated" className="grid grid-cols-2 gap-2">
              {items.map((item) => (
                <Card
                  current={item.n === selected}
                  item={item}
                  key={item.n}
                  onPick={() => setSelected(item.n)}
                />
              ))}
            </ol>
          )}
          {isReady(current) ? <Details item={current} total={items.length} /> : null}
          {items.length === 0 || running ? null : (
            <Button
              className="self-start rounded-[10px]"
              disabled={invalid}
              onClick={() => generate(false)}
              type="button"
              variant="outline"
            >
              <Shuffle aria-hidden />
              {BATCH} more
            </Button>
          )}
        </div>
        {items.length === 0 ? null : (
          <div className="flex flex-col gap-1.5 border-t px-4 pt-3 pb-4">
            {hint === undefined ? null : <p className="text-xs text-muted-foreground">{hint}</p>}
            <Button
              className="h-10 rounded-[10px]"
              disabled={!isReady(current)}
              onClick={use}
              type="button"
            >
              <Check aria-hidden />
              Use this
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
