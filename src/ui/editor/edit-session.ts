/**
 * The editing of the maze on screen (PLAN.md 3.4): its history, one step per gesture, and the copy
 * in My mazes its first edit makes. Pure: the editor's hook keeps a session and does the writing.
 *
 * @module
 */

import { mineKey, type MineRecipe } from '@/library';
import {
  createHistory,
  endGesture,
  mazesEqual,
  record,
  type History,
  type Maze,
  type Profile,
} from '@/maze';
import type { MineCopy, OpenMaze } from '@/ui/open-maze';

/** What My mazes calls a copy of a maze that is not in it, before {@link uniqueName}. */
export function copyName(name: string): string {
  return `${name} (edited)`;
}

/** The maze on screen and what was done to it since it opened. */
export interface EditSession {
  /** The maze as it opened. */
  readonly opened: OpenMaze;
  readonly history: History<Maze>;
  /** The rules it is checked by, which the Checks panel may change; not a step of undo. */
  readonly profile: Profile;
  /** The item of My mazes it saves to: itself, or the copy its first edit made. */
  readonly mine?: MineCopy & { readonly name: string };
  /**
   * Whether the route has moved to the copy; after that the original's route opens the original
   * again, in a session of its own.
   */
  readonly moved?: boolean;
  /**
   * The mazes the generator made in this session, or that opened with a recipe, each with its
   * recipe, which holds while the board shows that maze.
   */
  readonly generated: readonly Generated[];
}

/** A maze the generator made and its recipe. */
export interface Generated {
  readonly recipe: MineRecipe;
  readonly maze: Maze;
}

/** A session on `opened`, with nothing to undo; a maze of My mazes saves to itself. */
export function openSession(opened: OpenMaze): EditSession {
  const { mine, recipe } = opened.document;
  return {
    opened,
    history: createHistory(opened.maze, { equals: mazesEqual }),
    profile: opened.document.profile,
    mine: mine && { ...mine, name: opened.name },
    generated: recipe === undefined ? [] : [{ recipe, maze: opened.maze }],
  };
}

/**
 * The recipe of the walls on screen: the generator's while the board shows a maze it made, and
 * none once an edit or an undo moved off every such maze, until the board shows one again.
 */
export function sessionRecipe(session: EditSession): MineRecipe | undefined {
  const { generated, history } = session;
  return generated.findLast(({ maze }) => mazesEqual(history.present, maze))?.recipe;
}

/**
 * The session with the maze the generator made in place of the one on the board, as one step of
 * undo, and its recipe.
 */
export function withGenerated(session: EditSession, generated: Generated): EditSession {
  return {
    ...session,
    history: record(session.history, generated.maze),
    generated: [...session.generated, generated],
  };
}

/** The route key of the maze the session shows: its item of My mazes once it has one. */
export function sessionKey(session: EditSession): string {
  return session.mine === undefined ? session.opened.key : mineKey(session.mine.id);
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

/**
 * The maze on screen, as it is now, under the name and line of its item of My mazes once it has one,
 * checked by the session's profile; the file it came from counts only while it is unchanged.
 */
export function sessionView(session: EditSession): OpenMaze {
  const { opened, mine, history } = session;
  const { source, ...document } = opened.document;
  return {
    ...opened,
    key: sessionKey(session),
    maze: history.present,
    name: mine?.name ?? opened.name,
    detail: mine === undefined ? opened.detail : 'Saved in My mazes',
    document: {
      ...document,
      profile: session.profile,
      mine: mine && { id: mine.id, version: mine.version },
      recipe: sessionRecipe(session),
      source: source !== undefined && mazesEqual(history.present, opened.maze) ? source : undefined,
    },
  };
}

/** The session checked by `profile` from now on. */
export function withProfile(session: EditSession, profile: Profile): EditSession {
  return profile === session.profile ? session : { ...session, profile };
}

/** Whether the generator made the maze that opened as a new maze, as Use this opens it. */
function isGeneratedNew({ document }: OpenMaze): boolean {
  return document.created === true && document.recipe !== undefined;
}

/**
 * Whether the maze has no item of My mazes yet and needs one: it has changed, or the generator made
 * it as a new maze, which Use this keeps at once.
 */
export function needsCopy(session: EditSession): boolean {
  return (
    session.mine === undefined &&
    (isGeneratedNew(session.opened) || !mazesEqual(session.history.present, session.opened.maze))
  );
}

/**
 * Whether Save to My mazes can copy the maze there unedited: any maze not in My mazes yet but a
 * blank new one, which has nothing to keep until its first edit.
 */
export function canSaveToMine(session: EditSession): boolean {
  return (
    session.mine === undefined &&
    (session.opened.document.created !== true || isGeneratedNew(session.opened))
  );
}

/** The session with its item of My mazes, made or saved at `version`. */
export function withMine(
  session: EditSession,
  mine: MineCopy & { readonly name: string }
): EditSession {
  return { ...session, mine };
}

/**
 * Takes back everything the gesture in progress did, leaving no step, as when a pinch starts.
 * The history itself when no gesture is in progress.
 */
export function cancelEdit(history: History<Maze>): History<Maze> {
  const base = history.gestureBase;
  return base === undefined ? history : endGesture(record(history, base));
}
