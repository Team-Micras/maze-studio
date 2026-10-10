/**
 * The changes of the session (PLAN.md 3.4, DESIGN.md 6.2): the mazes created or edited in Mine
 * since the app loaded in this tab, each with the baseline it is compared with. In memory only; a
 * reload starts another session.
 *
 * @module
 */

import { createStore, type StoreApi } from 'zustand/vanilla';

import { diffMazes, mazesEqual, type Maze, type MazeDiff } from '@/maze';
import type { Route } from '@/ui/routes';

/** How an item came into the session: a copy, a new maze, or a maze of Mine from before. */
export type ChangeKind = 'copy' | 'new' | 'existing';

/** A maze of Mine changed in the session. */
export interface ChangeItem {
  /** Its id in Mine. */
  readonly id: string;
  readonly kind: ChangeKind;
  readonly name: string;
  /**
   * What it is compared with: the maze it was copied from, or its state at the start of the
   * session; none for a new maze.
   */
  readonly baseline: Maze | undefined;
  /** Where a copy came from, which Discard goes back to; none for a file or a new maze. */
  readonly source: Route | undefined;
}

/** The session's changes, and the first state seen of every maze of Mine opened. */
export interface SessionChanges {
  readonly items: readonly ChangeItem[];
  readonly firstSeen: ReadonlyMap<string, Maze>;
}

/** No changes yet. */
export const NO_CHANGES: SessionChanges = { items: [], firstSeen: new Map() };

/** The item of `id`, if the session has one. */
export function changeOf(changes: SessionChanges, id: string): ChangeItem | undefined {
  return changes.items.find((item) => item.id === id);
}

/** The session with a copy or a new maze, once its first edit has written it to Mine. */
export function addCreated(
  changes: SessionChanges,
  item: Omit<ChangeItem, 'kind'> & { readonly kind: 'copy' | 'new' }
): SessionChanges {
  return changeOf(changes, item.id) === undefined
    ? { ...changes, items: [...changes.items, item] }
    : changes;
}

/** Notes the state of a maze of Mine when the session first opens it; later states are ignored. */
export function noteSeen(changes: SessionChanges, id: string, maze: Maze): SessionChanges {
  if (changes.firstSeen.has(id)) {
    return changes;
  }

  return { ...changes, firstSeen: new Map([...changes.firstSeen, [id, maze]]) };
}

/**
 * The session with a maze of Mine from before it, once an edit of the session has saved it,
 * compared with the state first seen.
 */
export function addExisting(changes: SessionChanges, id: string, name: string): SessionChanges {
  if (changeOf(changes, id) !== undefined) {
    return changes;
  }

  return {
    ...changes,
    items: [
      ...changes.items,
      { id, kind: 'existing', name, baseline: changes.firstSeen.get(id), source: undefined },
    ],
  };
}

/** The session without the item of `id`, as after Keep or Discard. */
export function withoutChange(changes: SessionChanges, id: string): SessionChanges {
  return { ...changes, items: changes.items.filter((item) => item.id !== id) };
}

/** The diff of an item, current against its baseline, or none for a new maze. */
export function changeDiff(item: ChangeItem, current: Maze): MazeDiff | undefined {
  return item.baseline === undefined ? undefined : diffMazes(item.baseline, current);
}

function counted(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * The line under an item (DESIGN.md 6.2): "New maze", "No differences", or what changed, as in
 * "3 walls added, 1 removed, goal changed".
 */
export function changeSummary(item: ChangeItem, current: Maze): string {
  if (item.baseline === undefined) {
    return 'New maze';
  }

  const diff = changeDiff(item, current);

  if (diff === undefined) {
    return `Now ${current.width} × ${current.height}`;
  }

  if (mazesEqual(item.baseline, current)) {
    return 'No differences';
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

  const line = parts.join(', ');
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}`;
}

/** The changes of this tab's session, one store for the whole app. */
export const sessionChanges: StoreApi<SessionChanges> = createStore<SessionChanges>()(
  () => NO_CHANGES
);
