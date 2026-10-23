/**
 * What the Generate dialog says about a batch and its mazes (the mockup's panel copy): the status
 * line, a card's name and label, a maze's warnings, and the name, rules and request a picked maze
 * opens with. The feature sentences and tags are the generator's own (`TEXT`, `features`, `tags`).
 *
 * @module
 */

import { CHOICE, CHOICE_SHORT, features, measure, tags, TEXT, type Measured } from '@/generator';
import type { Profile } from '@/maze';
import type { NewMazeRequest } from '@/ui/new-maze';

import type { BatchState, Item } from './batch-run';

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
    ? 'Off target'
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
  if (state.progress !== null) {
    return `Generating ${state.progress.done} of ${state.progress.total}…`;
  }

  return state.items.some((item) => item.origin === 'seed')
    ? `Seeds ${state.firstSeed} to ${state.nextSeed - 1}, the most varied shown`
    : '';
}

/** What the dialog says when a worker failed. */
export const STOPPED = 'The generator could not make some of these mazes; the others are shown';

/** The title of a maze in the details: "#3 of 8". */
export function itemTitle(item: Item, total: number): string {
  return `#${item.n} of ${total}`;
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

/** The name a card has for a screen reader: number, cells to the goal and tags. */
export function cardLabel(item: ReadyItem): string {
  const has = itemTags(item);
  return `#${item.n}, ${measureItem(item).analysis.shortest} cells${has.length > 0 ? `, ${has.join(', ')}` : ''}`;
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
