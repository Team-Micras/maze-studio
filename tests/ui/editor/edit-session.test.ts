import { describe, expect, test } from 'vitest';

import {
  beginGesture,
  canUndo,
  createMaze,
  mazesEqual,
  record,
  redo,
  toggleWall,
  undo,
  type Edge,
  type History,
  type Maze,
} from '@/maze';
import {
  canSaveToMine,
  cancelEdit,
  copyName,
  followRoute,
  needsCopy,
  openSession,
  sessionAnswers,
  sessionKey,
  sessionRecipe,
  sessionView,
  withGenerated,
  withMine,
  withProfile,
  type EditSession,
} from '@/ui/editor/edit-session';
import type { OpenMaze } from '@/ui/open-maze';

const FIRST: Edge = { direction: 'horizontal', x: 1, y: 1 };

function repoMaze(): OpenMaze {
  return {
    key: 'repo:classic/test.txt',
    maze: createMaze({ width: 4, height: 4 }),
    name: 'test',
    detail: 'Classic, 4 × 4',
    document: {
      trailer: 'notes\n',
      profile: 'classic',
      origin: { path: 'classic/test.txt', sha: 'abc' },
    },
  };
}

/** Whether Save to My mazes is offered for `opened`, as it opens. */
function saveable(opened: OpenMaze): boolean {
  return canSaveToMine(openSession(opened));
}

/** The session with its history changed by `step`, as the editor's hook does it. */
function edit(session: EditSession, step: (history: History<Maze>) => History<Maze>): EditSession {
  return { ...session, history: step(session.history) };
}

/** The session with the wall `edge` toggled as one step. */
function toggled(session: EditSession, edge: Edge): EditSession {
  return edit(session, (history) => record(history, toggleWall(history.present, edge)));
}

describe('An editing session', () => {
  test('cancels a gesture without leaving a step, as when a second finger lands', () => {
    const history = record(
      beginGesture(openSession(repoMaze()).history),
      toggleWall(repoMaze().maze, FIRST)
    );
    const cancelled = cancelEdit(history);

    expect(mazesEqual(cancelled.present, repoMaze().maze)).toBe(true);
    expect(canUndo(cancelled)).toBe(false);
    expect(cancelEdit(cancelled)).toBe(cancelled);
  });

  test('needs a copy once the maze differs from what opened, and not after undoing back', () => {
    let session = openSession(repoMaze());
    expect(needsCopy(session)).toBe(false);
    session = toggled(session, FIRST);
    expect(needsCopy(session)).toBe(true);
    session = edit(session, undo);
    expect(needsCopy(session)).toBe(false);
  });

  test('offers Save to My mazes for any maze not in it but a blank new one, and copies a generated one at once', () => {
    const recipe = { version: 7, seed: 3, settings: { size: 4 } };
    const fresh = (extra: object): OpenMaze => ({
      ...repoMaze(),
      key: 'new:1',
      document: { trailer: '', profile: 'classic', created: true, ...extra },
    });

    expect(saveable(repoMaze())).toBe(true);
    expect(saveable({ ...repoMaze(), key: 'link:abc' })).toBe(true);
    expect(saveable({ ...repoMaze(), key: 'file:1' })).toBe(true);
    expect(saveable(fresh({ recipe }))).toBe(true);
    expect(saveable(fresh({}))).toBe(false);
    expect(saveable(fresh({ mine: { id: 'u-1', version: 1 } }))).toBe(false);
    expect(needsCopy(openSession(fresh({ recipe })))).toBe(true);
    expect(needsCopy(openSession(fresh({})))).toBe(false);
    expect(
      needsCopy(withMine(openSession(fresh({ recipe })), { id: 'u-1', version: 1, name: 'g' }))
    ).toBe(false);
  });

  test('once copied, answers to both keys and shows the copy, keeping the document', () => {
    let session = toggled(openSession(repoMaze()), FIRST);
    session = withMine(session, { id: 'u-1', version: 1, name: copyName('test') });
    const view = sessionView(session);

    expect(needsCopy(session)).toBe(false);
    expect(sessionKey(session)).toBe('mine:u-1');
    expect(sessionAnswers(session, 'repo:classic/test.txt')).toBe(true);
    expect(sessionAnswers(session, 'mine:u-1')).toBe(true);
    expect(sessionAnswers(session, 'repo:classic/other.txt')).toBe(false);
    expect(view.name).toBe('test (edited)');
    expect(view.detail).toBe('Saved in My mazes');
    expect(view.document.trailer).toBe('notes\n');
    expect(view.document.origin?.path).toBe('classic/test.txt');
    expect(view.document.mine).toEqual({ id: 'u-1', version: 1 });
  });

  test('once the route has moved to the copy, leaves the key of the original to a new session', () => {
    let session = toggled(openSession(repoMaze()), FIRST);

    expect(followRoute(session, 'repo:classic/test.txt')).toBe(session);
    session = withMine(session, { id: 'u-1', version: 1, name: 'test (edited)' });
    expect(
      sessionAnswers(followRoute(session, 'repo:classic/test.txt'), 'repo:classic/test.txt')
    ).toBe(true);
    session = followRoute(session, 'mine:u-1');

    expect(sessionAnswers(session, 'mine:u-1')).toBe(true);
    expect(sessionAnswers(session, 'repo:classic/test.txt')).toBe(false);
    expect(followRoute(session, 'mine:u-1')).toBe(session);
  });

  test('of a maze of My mazes saves to itself from the start', () => {
    const opened: OpenMaze = {
      ...repoMaze(),
      key: 'mine:u-2',
      name: 'My mazes one',
      detail: 'Saved in My mazes',
      document: { trailer: '', profile: 'free', mine: { id: 'u-2', version: 4 } },
    };
    const session = toggled(openSession(opened), FIRST);

    expect(needsCopy(session)).toBe(false);
    expect(session.mine).toEqual({ id: 'u-2', version: 4, name: 'My mazes one' });
    expect(sessionKey(session)).toBe('mine:u-2');
  });

  test('keeps its file source only while the maze is unchanged, and changes its rules apart', () => {
    const source = {
      fileName: 'classic/test.txt',
      irregularities: [],
      hadCR: false,
      hadFinalNewline: true,
    };
    const opened = { ...repoMaze(), document: { ...repoMaze().document, source } };
    let session = openSession(opened);

    expect(sessionView(session).document.source).toEqual(source);
    session = withProfile(session, 'free');
    expect(sessionView(session).document.profile).toBe('free');
    expect(canUndo(session.history)).toBe(false);
    session = toggled(session, FIRST);
    expect(sessionView(session).document.source).toBeUndefined();
    session = edit(session, undo);
    expect(sessionView(session).document.source).toEqual(source);
  });

  test('puts a generated maze on the board as one step, its recipe holding only while the walls are its own', () => {
    const recipe = { version: 7, seed: 9, settings: { size: 4 }, hash: '0123abcd' };
    const generated = toggleWall(toggleWall(repoMaze().maze, FIRST), {
      direction: 'vertical',
      x: 2,
      y: 1,
    });
    const before = openSession(repoMaze());
    const replaced = withGenerated(before, { maze: generated, recipe });

    expect(mazesEqual(replaced.history.present, generated)).toBe(true);
    expect(sessionRecipe(before)).toBeUndefined();
    expect(sessionView(replaced).document.recipe).toEqual(recipe);

    const undone = edit(replaced, undo);
    expect(mazesEqual(undone.history.present, repoMaze().maze)).toBe(true);
    expect(canUndo(undone.history)).toBe(false);
    expect(sessionView(undone).document.recipe).toBeUndefined();
    expect(sessionRecipe(edit(undone, redo))).toEqual(recipe);

    const drawn = toggled(replaced, { direction: 'horizontal', x: 2, y: 2 });
    expect(sessionRecipe(drawn)).toBeUndefined();
    expect(sessionRecipe(edit(drawn, undo))).toEqual(recipe);
  });

  test('of a generated maze holds its recipe from the start', () => {
    const recipe = { version: 7, seed: 9, settings: { size: 4 } };
    const session = openSession({ ...repoMaze(), document: { ...repoMaze().document, recipe } });

    expect(sessionRecipe(session)).toEqual(recipe);
    expect(sessionRecipe(toggled(session, FIRST))).toBeUndefined();
  });

  test('brings the earlier recipe back when an undo goes past a replace', () => {
    const first = { version: 7, seed: 1, settings: { size: 4 } };
    const second = { version: 7, seed: 2, settings: { size: 4 } };
    const session = openSession({
      ...repoMaze(),
      document: { ...repoMaze().document, recipe: first },
    });
    const replaced = withGenerated(session, {
      maze: toggleWall(repoMaze().maze, FIRST),
      recipe: second,
    });

    expect(sessionRecipe(replaced)).toEqual(second);
    expect(sessionRecipe(edit(replaced, undo))).toEqual(first);
    expect(sessionRecipe(edit(edit(replaced, undo), redo))).toEqual(second);
  });
});
