import { describe, expect, test } from 'vitest';

import {
  createMaze,
  mazesEqual,
  setGoals,
  setStart,
  toggleWall,
  type Edge,
  type Maze,
} from '@/maze';
import {
  addCreated,
  addExisting,
  changeOf,
  changeSummary,
  differs,
  keepChange,
  NO_CHANGES,
  noteSeen,
  withoutChange,
  type ChangeItem,
} from '@/ui/changes/session-changes';

const BASE = createMaze({ width: 6, height: 6 });

function walls(maze: Maze, ...edges: Edge[]): Maze {
  return edges.reduce(toggleWall, maze);
}

const A: Edge = { direction: 'horizontal', x: 1, y: 1 };
const B: Edge = { direction: 'horizontal', x: 2, y: 1 };
const C: Edge = { direction: 'vertical', x: 3, y: 1 };

function copy(baseline: Maze = BASE): ChangeItem {
  return {
    id: 'u-1',
    kind: 'copy',
    name: 'test (edited)',
    baseline,
    source: { kind: 'repo', path: 'classic/test.txt' },
  };
}

const NEW: ChangeItem = {
  id: 'u-2',
  kind: 'new',
  name: 'Untitled maze',
  baseline: undefined,
  source: undefined,
};

describe('The changes of the session', () => {
  test('take a copy once, and let Keep or Discard take it out', () => {
    let changes = addCreated(NO_CHANGES, { ...copy(), kind: 'copy' });
    changes = addCreated(changes, { ...copy(), kind: 'copy', name: 'again' });

    expect(changes.items).toHaveLength(1);
    expect(changeOf(changes, 'u-1')?.name).toBe('test (edited)');
    expect(withoutChange(changes, 'u-1').items).toEqual([]);
  });

  test('compare a maze of My mazes from before with the state first seen in the session', () => {
    const seen = walls(BASE, A);
    let changes = noteSeen(NO_CHANGES, 'm-1', { maze: seen, profile: 'training' });
    changes = noteSeen(changes, 'm-1', { maze: walls(BASE, A, B), profile: 'free' });
    changes = addExisting(changes, 'm-1', 'My mazes one');

    const item = changeOf(changes, 'm-1');

    expect(item?.kind).toBe('existing');
    expect(item?.name).toBe('My mazes one');
    expect(item?.source).toBeUndefined();
    expect(mazesEqual(item?.baseline ?? BASE, seen)).toBe(true);
    expect(item?.baselineProfile).toBe('training');
    expect(addExisting(changes, 'm-1', 'Other')).toBe(changes);
  });
});

describe('The line of a change', () => {
  test('counts the walls added and removed, and names the marks that moved', () => {
    const current = setStart(setGoals(walls(BASE, A, B, C), [{ x: 4, y: 4 }]), { x: 1, y: 0 });
    const withWall = walls(BASE, C);

    expect(changeSummary(copy(withWall), current)).toBe('2 walls added, goal changed, start moved');
    expect(changeSummary(copy(walls(BASE, A, B, C)), BASE)).toBe('3 walls removed');
    expect(changeSummary(copy(BASE), walls(BASE, A))).toBe('1 wall added');
    expect(changeSummary(copy(walls(BASE, A)), walls(BASE, B))).toBe('1 wall added, 1 removed');
    expect(changeSummary(copy(BASE), setGoals(BASE, [{ x: 2, y: 2 }]))).toBe('Goal changed');
  });

  test('says "New maze" without a baseline', () => {
    expect(changeSummary(NEW, walls(BASE, A))).toBe('New maze');
  });
});

describe('differs', () => {
  test('lists an item while its maze or profile is not its baseline, a new maze, and one not loaded', () => {
    const item: ChangeItem = { ...copy(), baselineProfile: 'classic' };

    expect(differs(item, BASE, 'classic')).toBe(false);
    expect(differs(item, walls(BASE, A), 'classic')).toBe(true);
    expect(differs(item, BASE, 'training')).toBe(true);
    expect(differs(item, BASE)).toBe(false);
    expect(differs(item, undefined)).toBe(true);
    expect(differs(NEW, BASE)).toBe(true);
  });
});

describe('Keep', () => {
  test('takes the item out, and a later save brings it back against the state kept', () => {
    const kept = walls(BASE, A);
    let changes = addCreated(NO_CHANGES, { ...copy(), kind: 'copy' });
    changes = keepChange(changes, 'u-1', { maze: kept, profile: 'classic' });

    expect(changes.items).toEqual([]);
    changes = addExisting(changes, 'u-1', 'test (edited)');
    expect(changeOf(changes, 'u-1')?.kind).toBe('existing');
    expect(mazesEqual(changeOf(changes, 'u-1')?.baseline ?? BASE, kept)).toBe(true);
    expect(changeSummary(changeOf(changes, 'u-1') ?? copy(), walls(kept, B))).toBe('1 wall added');
  });

  test('a save of a maze never noted adds nothing', () => {
    expect(addExisting(NO_CHANGES, 'x', 'X')).toBe(NO_CHANGES);
  });
});
