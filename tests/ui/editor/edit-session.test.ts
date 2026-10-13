import { describe, expect, test } from 'vitest';

import { createMaze, hasWall, mazesEqual, toggleWall, type Edge } from '@/maze';
import {
  beginEdit,
  cancelEdit,
  canRedoEdit,
  canUndoEdit,
  changeMaze,
  copyName,
  endEdit,
  followRoute,
  needsCopy,
  openSession,
  redoEdit,
  sessionAnswers,
  sessionKey,
  sessionView,
  undoEdit,
  withMine,
  withProfile,
} from '@/ui/editor/edit-session';
import type { OpenMaze } from '@/ui/open-maze';

const FIRST: Edge = { direction: 'horizontal', x: 1, y: 1 };

const EDGES: readonly Edge[] = [
  FIRST,
  { direction: 'horizontal', x: 2, y: 1 },
  { direction: 'vertical', x: 3, y: 1 },
];

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

describe('An editing session', () => {
  test('makes a whole gesture one step, however many walls it paints', () => {
    let session = beginEdit(openSession(repoMaze()));

    for (const edge of EDGES) {
      session = changeMaze(session, toggleWall(session.history.present, edge));
    }

    session = endEdit(session);

    expect(EDGES.every((edge) => hasWall(session.history.present, edge))).toBe(true);
    session = undoEdit(session);
    expect(mazesEqual(session.history.present, repoMaze().maze)).toBe(true);
    expect(canUndoEdit(session)).toBe(false);
    expect(canRedoEdit(session)).toBe(true);
    session = redoEdit(session);
    expect(EDGES.every((edge) => hasWall(session.history.present, edge))).toBe(true);
  });

  test('cancels a gesture without leaving a step, as when a second finger lands', () => {
    let session = beginEdit(openSession(repoMaze()));
    session = changeMaze(session, toggleWall(session.history.present, FIRST));
    session = cancelEdit(session);

    expect(mazesEqual(session.history.present, repoMaze().maze)).toBe(true);
    expect(canUndoEdit(session)).toBe(false);
  });

  test('needs a copy once the maze differs from what opened, and not after undoing back', () => {
    let session = openSession(repoMaze());
    expect(needsCopy(session)).toBe(false);
    session = changeMaze(session, toggleWall(session.history.present, FIRST));
    expect(needsCopy(session)).toBe(true);
    session = undoEdit(session);
    expect(needsCopy(session)).toBe(false);
  });

  test('once copied, answers to both keys and shows the copy, keeping the document', () => {
    let session = changeMaze(openSession(repoMaze()), toggleWall(repoMaze().maze, FIRST));
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
    let session = changeMaze(openSession(repoMaze()), toggleWall(repoMaze().maze, FIRST));

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
    const session = changeMaze(openSession(opened), toggleWall(opened.maze, FIRST));

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
    expect(canUndoEdit(session)).toBe(false);
    session = changeMaze(session, toggleWall(opened.maze, FIRST));
    expect(sessionView(session).document.source).toBeUndefined();
    session = undoEdit(session);
    expect(sessionView(session).document.source).toEqual(source);
  });
});
