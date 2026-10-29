/**
 * What the Generate dialog says about a batch and its mazes (the mockup's panel copy): the status
 * line, a card's name and label, a maze's warnings, and the name, rules and request a picked maze
 * opens with. The feature sentences and tags are the generator's own (`TEXT`, `features`, `tags`).
 *
 * @module
 */

import { CHOICE, CHOICE_SHORT, features, measure, tags, TEXT, type Measured } from '@/generator';
import { horizontalEdgeIndex, verticalEdgeIndex, type Maze, type Profile } from '@/maze';
import type { LoadingTrack } from '@/render/loading';
import type { NewMazeRequest } from '@/ui/new-maze';

import type { BatchState, Item } from './batch-run';
import { offTarget } from './misses';

/** A maze of the batch that is ready, with the walls and recipe it was built with. */
export type ReadyItem = Item & Required<Pick<Item, 'grid' | 'recipe' | 'seed'>>;

/** Whether an item is built and can be shown and picked. */
export function isReady(item: Item | undefined): item is ReadyItem {
  return (
    item?.status === 'ready' &&
    item.grid !== undefined &&
    item.recipe !== undefined &&
    item.seed !== undefined
  );
}

const measured = new WeakMap<Item, Measured>();

/** The numbers of a ready maze, measured once. */
export function measureItem(item: ReadyItem): Measured {
  const known = measured.get(item);

  if (known !== undefined) {
    return known;
  }

  const fresh = measure(item.grid, item.analysis);
  measured.set(item, fresh);
  return fresh;
}

/** The tags of a ready maze, as the card and the details list them. */
export function itemTags(item: ReadyItem): string[] {
  return tags(measureItem(item).analysis, item.recipe.settings).map((tag) => TEXT.tags[tag]);
}

/**
 * The warning a maze carries, if any: a recipe that rebuilt other walls than it saved, a maze of
 * an older generator, or one off its targets.
 */
export function itemWarning(item: ReadyItem): string | undefined {
  if (item.mismatch === true) {
    return `This generator rebuilt other walls than the recipe saved (wall hash ${item.recipe.hash ?? ''}, saved ${item.hash ?? ''}): the seed no longer verifies`;
  }

  if (item.older !== undefined) {
    return `Made by an older generator (version ${item.older}): ${item.saved === true ? 'shown as it was saved' : 'this one builds a different maze from the same seed'}`;
  }

  return item.energy !== undefined && item.energy !== null && item.energy !== 0
    ? offTarget(item.misses)
    : undefined;
}

/** The sentences under a ready maze: its features and, when relaxed, the route choice it got. */
export function itemFeatures(item: ReadyItem): string[] {
  const { analysis, grid } = measureItem(item);
  const lines = features(analysis, grid).map((feature) => feature.text);
  return item.relaxed === true
    ? [
        ...lines,
        `Route choice relaxed: amber keeps off white for ${CHOICE_SHORT.detour} % of its moves and ${CHOICE_SHORT.apart} cells apart, not ${CHOICE.detour} % and ${CHOICE.apart}`,
      ]
    : lines;
}

/** The line under the settings: the run's progress, or the seeds the batch shows. */
export function statusLine(state: BatchState): string {
  const { progress, seeds } = state;

  if (progress !== null) {
    return `Building ${progress.done} of ${progress.total}…`;
  }

  const count = state.items.filter((item) => item.origin === 'seed').length;

  if (count === 0) {
    return '';
  }

  return seeds === null || seeds === undefined
    ? `${count} mazes`
    : `Seeds ${seeds.first}–${seeds.last}`;
}

/** What the dialog says when a worker failed. */
export const STOPPED = 'The generator could not make some of these mazes; the others are shown';

/** The title of a maze in the details: "#3 of 8". */
export function itemTitle(place: number, total: number): string {
  return `#${place} of ${total}`;
}

/** Where a ready maze came from and how it was built: "seed 6001 · Routes part near the goal". */
export function itemOrigin(item: ReadyItem): string {
  return [
    item.origin === 'loaded' ? 'from a recipe' : '',
    `seed ${item.seed}`,
    item.style === undefined ? '' : TEXT.styles[item.style],
  ]
    .filter((part) => part !== '')
    .join(' · ');
}

/** The name a card has for a screen reader: number, cells to the goal, tags and what it missed. */
export function cardLabel(item: ReadyItem, place: number): string {
  const has = itemTags(item);
  const warning = itemWarning(item);
  return `#${place}, ${measureItem(item).analysis.shortest} cells${has.length > 0 ? `, ${has.join(', ')}` : ''}${warning === undefined ? '' : `. ${warning}`}`;
}

/** The rules a generated maze is checked by: the competition's for its size, or free. */
export function profileOf(item: ReadyItem): Profile {
  const { settings } = item.recipe;
  return settings.competition ? (settings.size === 32 ? 'halfsize' : 'classic') : 'free';
}

/** The New maze request that opens a ready maze in the editor, named after its seed. */
export function requestOf(item: ReadyItem): NewMazeRequest {
  return {
    kind: 'generated',
    maze: measureItem(item).maze,
    profile: profileOf(item),
    name: `Generated ${item.seed}`,
    recipe: item.recipe,
  };
}

/**
 * Whether a maze has no walls of its own yet: at most one inner wall, as New maze puts east of the
 * start.
 */
export function isBlank(maze: Maze): boolean {
  const { width: w, height: h, horizontal, vertical } = maze;
  let inner = 0;

  for (let y = 1; y < h; y++) {
    for (let x = 0; x < w; x++) {
      inner += horizontal.get(horizontalEdgeIndex(w, x, y)) ? 1 : 0;
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 1; x < w; x++) {
      inner += vertical.get(verticalEdgeIndex(w, x, y)) ? 1 : 0;
    }
  }

  return inner <= 1;
}

/** Whether the generator makes mazes of a board's size: 16 × 16 or 32 × 32. */
export function generatesFor(board: Maze): boolean {
  return board.width === board.height && (board.width === 16 || board.width === 32);
}

/** Whether a ready maze takes the place of the one on the board, being of its size. */
export function replacesBoard(item: ReadyItem, board: Maze | undefined): boolean {
  const { maze } = measureItem(item);
  return board !== undefined && maze.width === board.width && maze.height === board.height;
}

/** The line above Use this: what it does with the maze picked, from the library or the editor. */
export function pickHint(item: Item | undefined, board: Maze | undefined): string | undefined {
  if (board === undefined || !isReady(item)) {
    return 'Opens as a new maze; the first edit saves it in My mazes.';
  }

  if (replacesBoard(item, board)) {
    return isBlank(board) ? undefined : 'Replaces the maze on the board. Undo brings it back.';
  }

  return `Not the board’s size (${board.width} × ${board.height}): opens as a new maze.`;
}

/** What the dialog says of a board whose size the generator does not make. */
export function unsupportedBoard(board: Maze): string {
  return `The generator makes 16 × 16 and 32 × 32 mazes, not ${board.width} × ${board.height}: the maze picked opens as a new maze.`;
}

/**
 * The index ‹ and › step to from `index`, if they can: anywhere but past the ends, a maze still
 * being built included, which shows its loading board.
 */
export function stepTo(items: readonly Item[], index: number, delta: -1 | 1): number | undefined {
  const next = index + delta;
  return next < 0 || next >= items.length ? undefined : next;
}

/** The least sideways travel, in CSS pixels, that counts as a swipe. */
export const SWIPE = 48;

/**
 * What a swipe of `dx` across and `dy` down asks: the next maze (-1 is the one before) for a mostly
 * sideways move of at least {@link SWIPE}, a swipe left showing the next; 0 for anything else.
 */
export function swipeStep(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE || Math.abs(dx) < 2 * Math.abs(dy)) {
    return 0;
  }

  return dx < 0 ? 1 : -1;
}

/** What a maze still building is at, in the title line of the maze opened. */
export function phaseText({ phase, attempt }: LoadingTrack): string {
  switch (phase) {
    case 'routes':
      return attempt > 1 ? `Trying routes · attempt ${attempt}` : 'Trying routes';
    case 'forest':
      return 'Growing the maze around the routes';
    case 'loops':
      return 'Adding loops';
    case 'check':
      return 'Checking the targets';
    case 'tune':
      return 'Fine-tuning';
    case 'another':
      return 'Trying another way';
    case null:
      return 'Building…';
  }
}
