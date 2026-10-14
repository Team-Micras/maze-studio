/**
 * The changes of the session (PLAN.md 3.4, DESIGN.md 6.2): the mazes created or edited in My mazes
 * since the app loaded in this tab, each with the baseline it is compared with. In memory only; a
 * reload starts another session.
 *
 * @module
 */

import { createStore, type StoreApi } from 'zustand/vanilla';

import { diffMazes, mazesEqual, type Maze, type MazeDiff, type Profile } from '@/maze';
import { categoryLabel } from '@/ui/labels';
import type { Route } from '@/ui/routes';

/** How an item came into the session: a copy, a new maze, or a maze of My mazes from before. */
export type ChangeKind = 'copy' | 'new' | 'existing';

/** A maze of My mazes changed in the session. */
export interface ChangeItem {
  /** Its id in My mazes. */
  readonly id: string;
  readonly kind: ChangeKind;
  readonly name: string;
  /**
   * What it is compared with: the maze it was copied from, or its state at the start of the
   * session; none for a new maze.
   */
  readonly baseline: Maze | undefined;
  /** The profile of the baseline, which Discard of a maze of My mazes puts back with it. */
  readonly baselineProfile?: Profile;
  /** Where a copy came from, which Discard goes back to; none for a file or a new maze. */
  readonly source: Route | undefined;
}

/** A state of a maze of My mazes that a later change is compared with. */
export interface SeenState {
  readonly maze: Maze;
  readonly profile: Profile;
}

/**
 * The session's changes, and the state each maze of My mazes is compared with: the first one seen, or
 * the one Keep left.
 */
export interface SessionChanges {
  readonly items: readonly ChangeItem[];
  readonly firstSeen: ReadonlyMap<string, SeenState>;
}

/** No changes yet. */
export const NO_CHANGES: SessionChanges = { items: [], firstSeen: new Map() };

/** The item of `id`, if the session has one. */
export function changeOf(changes: SessionChanges, id: string): ChangeItem | undefined {
  return changes.items.find((item) => item.id === id);
}

/** The session with a copy or a new maze, once its first edit has written it to My mazes. */
export function addCreated(
  changes: SessionChanges,
  item: Omit<ChangeItem, 'kind'> & { readonly kind: 'copy' | 'new' }
): SessionChanges {
  return changeOf(changes, item.id) === undefined
    ? { ...changes, items: [...changes.items, item] }
    : changes;
}

/** Notes the state of a maze of My mazes when the session first opens it; later states are ignored. */
export function noteSeen(changes: SessionChanges, id: string, seen: SeenState): SessionChanges {
  if (changes.firstSeen.has(id)) {
    return changes;
  }

  return { ...changes, firstSeen: new Map([...changes.firstSeen, [id, seen]]) };
}

/**
 * The session with a maze of My mazes changed by a save of the session, compared with the state noted
 * for it; nothing changes for a maze already listed or never noted.
 */
export function addExisting(changes: SessionChanges, id: string, name: string): SessionChanges {
  const seen = changes.firstSeen.get(id);

  if (changeOf(changes, id) !== undefined || seen === undefined) {
    return changes;
  }

  return {
    ...changes,
    items: [
      ...changes.items,
      {
        id,
        kind: 'existing',
        name,
        baseline: seen.maze,
        baselineProfile: seen.profile,
        source: undefined,
      },
    ],
  };
}

/** The session with the item of `id`, if listed, under its new name. */
export function renameChange(changes: SessionChanges, id: string, name: string): SessionChanges {
  return changeOf(changes, id) === undefined
    ? changes
    : {
        ...changes,
        items: changes.items.map((item) => (item.id === id ? { ...item, name } : item)),
      };
}

/** The session without the item of `id`, as after Discard. */
export function withoutChange(changes: SessionChanges, id: string): SessionChanges {
  return { ...changes, items: changes.items.filter((item) => item.id !== id) };
}

/**
 * The session after Keep: the item is out, and `kept`, its state now, is what a later edit of it
 * is compared with, as for a maze of My mazes from before the session.
 */
export function keepChange(changes: SessionChanges, id: string, kept: SeenState): SessionChanges {
  return {
    items: changes.items.filter((item) => item.id !== id),
    firstSeen: new Map([...changes.firstSeen, [id, kept]]),
  };
}

/**
 * Whether an item differs from its baseline now, so Changes lists it and the chip counts it: a new
 * maze always does, and so does one not loaded yet; else its maze, or with `profile` its profile
 * too. Without `profile` it says whether the board has a diff to draw.
 */
export function differs(item: ChangeItem, maze: Maze | undefined, profile?: Profile): boolean {
  return (
    item.baseline === undefined ||
    maze === undefined ||
    !mazesEqual(item.baseline, maze) ||
    (profile !== undefined &&
      item.baselineProfile !== undefined &&
      profile !== item.baselineProfile)
  );
}

/** The diff of an item, current against its baseline, or none for a new maze. */
export function changeDiff(item: ChangeItem, current: Maze): MazeDiff | undefined {
  return item.baseline === undefined ? undefined : diffMazes(item.baseline, current);
}

function counted(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * The line under an item (DESIGN.md 6.2): "New maze", or what changed, as in "3 walls added, 1
 * removed, goal changed" or "Rules changed to Training" with the `profile` it has now; an item back
 * at its baseline is not shown.
 */
export function changeSummary(item: ChangeItem, current: Maze, profile?: Profile): string {
  if (item.baseline === undefined) {
    return 'New maze';
  }

  const diff = changeDiff(item, current);

  if (diff === undefined) {
    return `Now ${current.width} × ${current.height}`;
  }

  const parts: string[] = [];

  if (diff.added.length > 0) {
    parts.push(`${counted(diff.added.length, 'wall')} added`);
  }

  if (diff.removed.length > 0) {
    parts.push(
      diff.added.length > 0
        ? `${diff.removed.length} removed`
        : `${counted(diff.removed.length, 'wall')} removed`
    );
  }

  if (diff.goalsAdded.length > 0 || diff.goalsRemoved.length > 0) {
    parts.push('goal changed');
  }

  if (diff.startBefore?.x !== diff.startAfter?.x || diff.startBefore?.y !== diff.startAfter?.y) {
    parts.push('start moved');
  }

  if (
    profile !== undefined &&
    item.baselineProfile !== undefined &&
    profile !== item.baselineProfile
  ) {
    parts.push(`rules changed to ${categoryLabel(profile)}`);
  }

  const line = parts.join(', ');
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}`;
}

/** The changes of this tab's session, one store for the whole app. */
export const sessionChanges: StoreApi<SessionChanges> = createStore<SessionChanges>()(
  () => NO_CHANGES
);
