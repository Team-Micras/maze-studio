import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { Maze, Profile } from '@/maze';
import { reloadLibrary } from '@/ui/library/use-library';
import { replaceRoute } from '@/ui/navigation';
import { addCreated, addExisting, noteSeen, sessionChanges } from '@/ui/changes/session-changes';
import { routeOfKey, type OpenMaze } from '@/ui/open-maze';
import { appStorage } from '@/ui/storage';
import { showToast } from '@/ui/toasts';

import {
  beginEdit,
  cancelEdit,
  canRedoEdit,
  canUndoEdit,
  changeMaze,
  editing,
  endEdit,
  followRoute,
  openSession,
  redoEdit,
  sessionAnswers,
  sessionView,
  undoEdit,
  withMine,
  withProfile,
  type EditSession,
} from './edit-session';
import { MineWriter } from './mine-writer';

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
  readonly end: () => void;
  /** Takes back the gesture in progress. */
  readonly cancel: () => void;
  readonly undo: () => void;
  readonly redo: () => void;
  /** Checks the maze by `profile` from now on, saved with it once it is in Mine. */
  readonly setProfile: (profile: Profile) => void;
  /** Starts a new session on `open`, as when Discard has put back the maze on screen. */
  readonly reopen: (open: OpenMaze) => void;
}

/** What the editor says while another tab holds a newer version (DESIGN.md 12). */
export const NEWER_ELSEWHERE = 'Opened in another tab. Reload to edit.';

const MAY_BE_CLEARED = 'This browser may clear Mine. Export a backup from the menu.';

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
 * starts again with every other maze, and autosave. The first edit of a maze that is not in Mine
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
      copied: (opened, copy, item) => {
        setStored((before) => (before?.opened === opened ? withMine(before, copy) : before));
        const created = opened.document.created === true;
        sessionChanges.setState((changes) =>
          addCreated(changes, {
            id: item.id,
            kind: created ? 'new' : 'copy',
            name: item.name,
            baseline: created ? undefined : opened.maze,
            source: routeOfKey(opened.key),
          })
        );

        if (openedNow.current === opened) {
          replaceRoute({ kind: 'mine', id: item.id });
        }

        reloadLibrary();
        void appStorage().then((storage) => {
          if (storage?.mine.persistence === 'best-effort') {
            showToast(MAY_BE_CLEARED);
          }
        });
      },
      saved: (opened, copy) => {
        if (opened.document.mine !== undefined) {
          sessionChanges.setState((changes) => addExisting(changes, copy.id, copy.name));
        }

        reloadLibrary();
      },
      refused: (opened) => setRefused((before) => new Set([...before, opened])),
      failed: (error) => {
        showToast(
          `Could not save to Mine (${error instanceof Error ? error.message : String(error)})`
        );
      },
    });
  }, []);

  const readOnly = session !== undefined && refused.has(session.opened);
  const opened = session?.opened;

  useEffect(() => {
    const mine = opened?.document.mine;

    if (opened !== undefined && mine !== undefined) {
      sessionChanges.setState((changes) => noteSeen(changes, mine.id, opened.maze));
    }
  }, [opened]);

  useEffect(() => {
    if (session !== undefined && !editing(session) && !readOnly) {
      writer.current?.write(session);
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

  const guarded = useCallback(
    (step: (session: EditSession) => EditSession) => () => {
      if (!readOnly) {
        update(step);
      }
    },
    [readOnly, update]
  );

  const change = useCallback(
    (maze: Maze) => {
      if (!readOnly) {
        update((current) => changeMaze(current, maze));
      }
    },
    [readOnly, update]
  );

  const current = useCallback(() => latest.current?.history.present, []);

  return {
    shown: session === undefined ? undefined : sessionView(session),
    answers: (key) => session !== undefined && sessionAnswers(session, key),
    readOnly,
    canUndo: session !== undefined && canUndoEdit(session),
    canRedo: session !== undefined && canRedoEdit(session),
    current,
    begin: guarded(beginEdit),
    change,
    end: guarded(endEdit),
    cancel: guarded(cancelEdit),
    undo: guarded(undoEdit),
    redo: guarded(redoEdit),
    setProfile: (profile) => update((before) => withProfile(before, profile)),
    reopen: (open) => {
      const next = openSession(open);
      latest.current = next;
      setStored(next);
    },
  };
}
