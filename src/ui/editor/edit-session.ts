/**
 * The editing of the maze on screen (PLAN.md 3.4): its history, one step per gesture, and the copy
 * in Mine its first edit makes. Pure: the editor's hook keeps a session and does the writing.
 *
 * @module
 */

import {
  beginGesture,
  canRedo,
  canUndo,
  createHistory,
  endGesture,
  inGesture,
  mazesEqual,
  record,
  redo,
  undo,
  type History,
  type Maze,
} from '@/maze';
import type { MineCopy, OpenMaze } from '@/ui/open-maze';

/** What Mine calls a copy of a maze that is not in it, before {@link uniqueName}. */
export function copyName(name: string): string {
  return `${name} (edited)`;
}

/** The maze on screen and what was done to it since it opened. */
export interface EditSession {
  /** The maze as it opened. */
  readonly opened: OpenMaze;
  readonly history: History<Maze>;
  /** The item of Mine it saves to: itself, or the copy its first edit made. */
  readonly mine?: MineCopy & { readonly name: string };
  /**
   * Whether the route has moved to the copy; after that the original's route opens the original
   * again, in a session of its own.
   */
  readonly moved?: boolean;
}

/** A session on `opened`, with nothing to undo; a maze of Mine saves to itself. */
export function openSession(opened: OpenMaze): EditSession {
  const { mine } = opened.document;
  return {
    opened,
    history: createHistory(opened.maze, { equals: mazesEqual }),
    ...(mine === undefined ? {} : { mine: { ...mine, name: opened.name } }),
  };
}

/** The route key of the maze the session shows: its item of Mine once it has one. */
export function sessionKey(session: EditSession): string {
  return session.mine === undefined ? session.opened.key : `mine:${session.mine.id}`;
}

/**
 * Whether the session is the one for the maze `key` names: its copy's, or the one it opened as
 * until the route has moved to the copy.
 */
export function sessionAnswers(session: EditSession, key: string): boolean {
  return key === sessionKey(session) || (session.moved !== true && key === session.opened.key);
}

/** The session once the route names `key`, which marks it moved when that is its copy's. */
export function followRoute(session: EditSession, key: string): EditSession {
  return session.moved !== true && session.mine !== undefined && key === sessionKey(session)
    ? { ...session, moved: true }
    : session;
}

/** The maze on screen, as it is now, under the name and line of its item of Mine once it has one. */
export function sessionView(session: EditSession): OpenMaze {
  const { opened, mine, history } = session;
  return {
    ...opened,
    key: sessionKey(session),
    maze: history.present,
    name: mine?.name ?? opened.name,
    detail: mine === undefined ? opened.detail : 'Saved in Mine',
    document:
      mine === undefined
        ? opened.document
        : { ...opened.document, mine: { id: mine.id, version: mine.version } },
  };
}

/** Whether the maze has changed and has no item of Mine to keep the change in yet. */
export function needsCopy(session: EditSession): boolean {
  return session.mine === undefined && !mazesEqual(session.history.present, session.opened.maze);
}

/** The session with its item of Mine, made or saved at `version`. */
export function withMine(
  session: EditSession,
  mine: MineCopy & { readonly name: string }
): EditSession {
  return { ...session, mine };
}

function withHistory(session: EditSession, history: History<Maze>): EditSession {
  return history === session.history ? session : { ...session, history };
}

/** Starts a gesture: what changes until {@link endEdit} is one step. */
export function beginEdit(session: EditSession): EditSession {
  return withHistory(session, beginGesture(session.history));
}

/** Puts `maze` on screen, inside the gesture in progress or as one step of its own. */
export function changeMaze(session: EditSession, maze: Maze): EditSession {
  return withHistory(session, record(session.history, maze));
}

/** Ends the gesture in progress, one step if it changed anything. */
export function endEdit(session: EditSession): EditSession {
  return withHistory(session, endGesture(session.history));
}

/** Takes back everything the gesture in progress did, leaving no step, as when a pinch starts. */
export function cancelEdit(session: EditSession): EditSession {
  const base = session.history.gestureBase;

  if (base === undefined) {
    return session;
  }

  return withHistory(session, endGesture(record(session.history, base)));
}

/** Whether a gesture is in progress. */
export function editing(session: EditSession): boolean {
  return inGesture(session.history);
}

/** Goes back one step. */
export function undoEdit(session: EditSession): EditSession {
  return withHistory(session, undo(session.history));
}

/** Goes forward one undone step. */
export function redoEdit(session: EditSession): EditSession {
  return withHistory(session, redo(session.history));
}

/** Whether there is a step to undo. */
export function canUndoEdit(session: EditSession): boolean {
  return canUndo(session.history);
}

/** Whether there is a step to redo. */
export function canRedoEdit(session: EditSession): boolean {
  return canRedo(session.history);
}
