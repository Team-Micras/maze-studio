import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { folderFileOf, refOf } from '@/library';
import {
  beginGesture,
  canRedo,
  canUndo,
  endGesture,
  inGesture,
  mazesEqual,
  record,
  redo,
  undo,
  type History,
  type Maze,
  type Profile,
} from '@/maze';
import { reloadLibrary } from '@/ui/library/use-library';
import { pushRoute, replaceRoute } from '@/ui/navigation';
import type { Route } from '@/ui/routes';
import {
  addCreated,
  addExisting,
  noteSeen,
  renameChange,
  sessionChanges,
} from '@/ui/changes/session-changes';
import type { OpenMaze } from '@/ui/open-maze';
import { appStorage } from '@/ui/storage';
import { showToast } from '@/ui/toasts';

import {
  canSaveToMine,
  cancelEdit,
  followRoute,
  openSession,
  sessionAnswers,
  sessionView,
  withGenerated,
  withMine,
  withProfile,
  type EditSession,
  type Generated,
} from './edit-session';
import { MineWriter } from './mine-writer';
import { noteWrites, trackWriter } from './pending-writes';

/** What the editor needs to know about the app's route. */
export interface MazeEditorInput {
  /** The maze the route or a file opens, as the library or the route has it. */
  readonly opened: OpenMaze | undefined;
  /** The key of the maze the route or the file asks for, which may not be loaded yet. */
  readonly wanted: string | undefined;
}

/** Editing the maze on screen. */
export interface MazeEditor {
  /** The maze on screen as edited; what opened while nothing has changed it. */
  readonly shown: OpenMaze | undefined;
  /**
   * Whether the maze `key` names is the one being edited, so that its route is not missing while
   * the library loads its new copy.
   */
  readonly answers: (key: string) => boolean;
  /** Whether another tab saved this maze since it opened, which stops editing here. */
  readonly readOnly: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** The maze as it is now, also in the middle of a gesture. */
  readonly current: () => Maze | undefined;
  /** Starts a gesture, one step of undo however much it changes. */
  readonly begin: () => void;
  /** Puts `maze` on screen, within the gesture in progress or as a step of its own. */
  readonly change: (maze: Maze) => void;
  /**
   * Puts the maze the generator made on screen as one step of undo, with its recipe.
   *
   * @returns Whether it did: not on a maze another tab holds.
   */
  readonly replace: (generated: Generated) => boolean;
  readonly end: () => void;
  /** Takes back the gesture in progress. */
  readonly cancel: () => void;
  readonly undo: () => void;
  readonly redo: () => void;
  /** Checks the maze by `profile` from now on, saved with it once it is in My mazes. */
  readonly setProfile: (profile: Profile) => void;
  /** Whether the maze is not yet in My mazes and Save to My mazes copies it there; not a blank new maze. */
  readonly canSaveToMine: boolean;
  /** The file of the opened folder the maze came from, once its copy is in My mazes. */
  readonly folderFile: string | undefined;
  /** Copies the maze to My mazes, edited or not, and moves the editor to the copy. */
  readonly saveToMine: () => void;
  /** Renames the maze's item of My mazes; `false` when My mazes refused it. */
  readonly rename: (name: string) => Promise<boolean>;
  /** The version of item `id` of My mazes this tab saved last, if it saved one. */
  readonly savedVersion: (id: string) => number | undefined;
  /** Starts a new session on `open`, as when Discard has put back the maze on screen. */
  readonly reopen: (open: OpenMaze) => void;
}

/** What the editor says while another tab holds a newer version (DESIGN.md 12). */
export const NEWER_ELSEWHERE = 'Opened in another tab. Reload to edit.';

const MAY_BE_CLEARED = 'This browser may clear My mazes. Export a backup from the menu.';

function sessionFor(
  session: EditSession | undefined,
  { opened, wanted }: MazeEditorInput
): EditSession | undefined {
  if (wanted === undefined) {
    return undefined;
  }

  if (session !== undefined && sessionAnswers(session, wanted)) {
    return followRoute(session, wanted);
  }

  return opened?.key === wanted ? openSession(opened) : undefined;
}

/**
 * The editing of the maze on screen (PLAN.md 3.4): one step of undo per gesture, a history that
 * starts again with every other maze, and autosave. The first edit of a maze that is not in My mazes
 * copies it there as "<name> (edited)" and replaces the route with the copy's, without adding a
 * history entry; the original never changes.
 */
export function useMazeEditor(input: MazeEditorInput): MazeEditor {
  const [stored, setStored] = useState<EditSession | undefined>(undefined);
  const [refused, setRefused] = useState<ReadonlySet<OpenMaze>>(new Set());
  const session = sessionFor(stored, input);
  const latest = useRef(session);
  const openedNow = useRef<OpenMaze | undefined>(undefined);

  if (session !== stored) {
    setStored(session);
  }

  useLayoutEffect(() => {
    latest.current = session;
    openedNow.current = session?.opened;
  });

  const writer = useRef<MineWriter | undefined>(undefined);

  useEffect(() => {
    writer.current = new MineWriter(async () => (await appStorage())?.mine, {
      copied: (opened, copy, written) => {
        setStored((before) => (before?.opened === opened ? withMine(before, copy) : before));
        const created = opened.document.created === true;
        sessionChanges.setState((changes) =>
          !created && mazesEqual(written.maze, opened.maze)
            ? noteSeen(changes, copy.id, written)
            : addCreated(changes, {
                id: copy.id,
                kind: created ? 'new' : 'copy',
                name: copy.name,
                baseline: created ? undefined : opened.maze,
                baselineProfile: opened.document.profile,
                source: refOf(opened.key),
              })
        );

        if (openedNow.current === opened) {
          const route: Route = { kind: 'mine', id: copy.id };

          if (refOf(opened.key) === undefined) {
            pushRoute(route);
          } else {
            replaceRoute(route);
          }
        }

        reloadLibrary();
        void appStorage().then((storage) => {
          if (storage?.mine.persistence === 'best-effort') {
            showToast(MAY_BE_CLEARED);
          }
        });
      },
      saved: (_, copy) => {
        sessionChanges.setState((changes) => addExisting(changes, copy.id, copy.name));
        reloadLibrary();
      },
      refused: (opened) => setRefused((before) => new Set([...before, opened])),
      failed: (error) => {
        showToast(
          `Could not save to My mazes (${error instanceof Error ? error.message : String(error)}). Download .txt to keep it`
        );
      },
    });
    return trackWriter(writer.current);
  }, []);

  const readOnly = session !== undefined && refused.has(session.opened);
  const opened = session?.opened;

  useEffect(() => {
    const mine = opened?.document.mine;

    if (opened !== undefined && mine !== undefined) {
      sessionChanges.setState((changes) =>
        noteSeen(changes, mine.id, {
          maze: opened.maze,
          profile: opened.document.profile,
          recipe: opened.document.recipe,
        })
      );
    }
  }, [opened]);

  useEffect(() => {
    const mineWriter = writer.current;

    if (
      session !== undefined &&
      !inGesture(session.history) &&
      !readOnly &&
      mineWriter !== undefined
    ) {
      mineWriter.write(session);
      noteWrites(mineWriter.idle());
    }
  }, [session, readOnly]);

  const update = useCallback((step: (session: EditSession) => EditSession): void => {
    const current = latest.current;

    if (current === undefined) {
      return;
    }

    const next = step(current);
    latest.current = next;
    setStored(next);
  }, []);

  const edit = useCallback(
    (step: (history: History<Maze>) => History<Maze>): void => {
      if (!readOnly) {
        update((before) => {
          const history = step(before.history);
          return history === before.history ? before : { ...before, history };
        });
      }
    },
    [readOnly, update]
  );

  const change = useCallback((maze: Maze) => edit((history) => record(history, maze)), [edit]);

  const current = useCallback(() => latest.current?.history.present, []);

  return {
    shown: session === undefined ? undefined : sessionView(session),
    answers: (key) => session !== undefined && sessionAnswers(session, key),
    readOnly,
    canUndo: session !== undefined && canUndo(session.history),
    canRedo: session !== undefined && canRedo(session.history),
    current,
    begin: () => edit(beginGesture),
    change,
    replace: (generated) => {
      if (readOnly || latest.current === undefined) {
        return false;
      }

      update((before) => withGenerated(before, generated));
      return true;
    },
    end: () => edit(endGesture),
    cancel: () => edit(cancelEdit),
    undo: () => edit(undo),
    redo: () => edit(redo),
    setProfile: (profile) => update((before) => withProfile(before, profile)),
    canSaveToMine: session !== undefined && canSaveToMine(session),
    folderFile: session?.mine === undefined ? undefined : folderFileOf(session.opened.key),
    saveToMine: () => {
      const now = latest.current;

      const mineWriter = writer.current;

      if (now !== undefined && mineWriter !== undefined) {
        noteWrites(mineWriter.saveToMine(now));
      }
    },
    rename: async (name) => {
      const now = latest.current;
      const done = now === undefined ? false : await writer.current?.rename(now, name);

      if (done === true && now?.mine !== undefined) {
        const renamed = { ...now.mine, name };
        setStored((before) => (before?.opened === now.opened ? withMine(before, renamed) : before));
        sessionChanges.setState((changes) => renameChange(changes, renamed.id, name));
      }

      return done === true;
    },
    savedVersion: (id) => writer.current?.savedVersion(id),
    reopen: (open) => {
      const next = openSession(open);
      latest.current = next;
      setStored(next);
    },
  };
}
