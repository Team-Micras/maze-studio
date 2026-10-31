import { useEffect, useState } from 'react';
import { useStore } from 'zustand';

import { DEFAULT_FILTER, keyOf, looseKey, mineIdOf, type LibraryFilter } from '@/library';
import { parseMazeText, type Maze, type Profile } from '@/maze';

import { CANVAS_ID } from './canvas-id';
import { discardChange } from './changes/discard';
import { changeOf, differs, sessionChanges, withoutChange } from './changes/session-changes';
import { openNewMaze } from './new-maze';
import { useMazeEditor } from './editor/use-maze-editor';
import { useCloseOnBack } from './hooks/use-close-on-back';
import { useRoute } from './hooks/use-route';
import { ReportDialog } from './library/report-dialog';
import { updateNote } from './library/update-note';
import { reloadLibrary, useLibrary } from './library/use-library';
import { useMineBackup } from './library/use-mine-backup';
import { useRepoUpdates } from './library/use-repo-updates';
import { libraryBelow, pushRoute, replaceRoute } from './navigation';
import { looseDocument, MAX_FILE_BYTES, openingOf, type OpenMaze } from './open-maze';
import { TooltipProvider } from './primitives/tooltip';
import { LIBRARY_ROUTE, routeHash, type LibraryRoute } from './routes';
import { Studio } from './studio/studio';
import { Toaster } from './toaster';
import { focusArtboard } from './library/library-scroller';
import { appStorage } from './storage';
import { showToast } from './toasts';

/** A maze on screen: its key, and its maze and profile as they were. */
interface Seen {
  readonly key: string;
  readonly maze: Maze;
  readonly profile: Profile;
}

/**
 * The maze on screen at this route and at the route before, if any: leaving a maze of My mazes
 * changed in the session for the library shows My mazes, so the flight lands on it.
 */
interface RouteTrail {
  readonly hash: string;
  readonly at: Seen | undefined;
  readonly left: Seen | undefined;
}

/** The library's filter after leaving a maze of My mazes changed in the session (PLAN.md 3.4). */
const MINE_FILTER: LibraryFilter = { ...DEFAULT_FILTER, source: 'mine' };

/** A maze opened from a file or made new, shown while the URL stays where it was opened. */
interface LooseMaze {
  readonly open: OpenMaze;
  readonly at: string;
  /** Tells two loose mazes apart, even with the same name. */
  readonly id: number;
}

/** Focuses the open maze's canvas, or the library's first maze on screen when no maze is open. */
function focusContent(): void {
  const canvas = document.getElementById(CANVAS_ID);

  if (canvas !== null && getComputedStyle(canvas).visibility !== 'hidden') {
    canvas.focus();
  } else {
    focusArtboard();
  }
}

/**
 * The whole app: the studio, showing the library or the maze the route opens, as edited, with the
 * toasts on top. A `.txt` file and a new maze open without a route of their own; the Library button
 * closes them (PLAN.md 3.4). A route that names the copy an edit has just made is not missing
 * while the library loads it. Leaving a maze of My mazes changed in the session lands on it, in My mazes,
 * and Discard of the Changes panel deletes a copy or puts back a maze of My mazes, leaving it if open.
 */
export function App() {
  const route = useRoute();
  const { library, failed: libraryFailed } = useLibrary();
  const backup = useMineBackup();
  const updates = useRepoUpdates();
  const hash = routeHash(route);
  const [loose, setLoose] = useState<LooseMaze | undefined>(undefined);
  const opening = openingOf(route, library);
  const shownLoose = loose?.at === hash ? loose.open : undefined;

  if (loose !== undefined && loose.at !== hash) {
    setLoose(undefined);
  }
  const [lastLibrary, setLastLibrary] = useState<LibraryRoute>(LIBRARY_ROUTE);

  if (route.kind === 'library' && routeHash(lastLibrary) !== hash) {
    setLastLibrary(route);
  }

  useCloseOnBack({
    open: shownLoose !== undefined,
    onOpenChange: (open) => {
      if (!open) {
        setLoose(undefined);
      }
    },
  });
  const opened = shownLoose ?? (opening.status === 'open' ? opening.open : undefined);
  const routeKey = route.kind === 'library' ? undefined : keyOf(route);
  const editor = useMazeEditor({ opened, wanted: shownLoose?.key ?? routeKey });
  const changes = useStore(sessionChanges);
  const shown = editor.shown;
  const seen =
    shown === undefined
      ? undefined
      : { key: shown.key, maze: shown.maze, profile: shown.document.profile };
  const [trail, setTrail] = useState<RouteTrail>({ hash, at: seen, left: undefined });

  if (trail.hash !== hash) {
    setTrail({ hash, at: seen, left: trail.at });
  } else if (
    seen !== undefined &&
    (seen.key !== trail.at?.key || seen.maze !== trail.at.maze || seen.profile !== trail.at.profile)
  ) {
    setTrail({ ...trail, at: seen });
  }

  const leftItem = changeOf(changes, mineIdOf(trail.left?.key) ?? '');
  const landing =
    route.kind === 'library' &&
    route.filter.source !== 'mine' &&
    trail.left !== undefined &&
    leftItem !== undefined &&
    differs(leftItem, trail.left.maze, trail.left.profile)
      ? MINE_FILTER
      : undefined;
  const missingOpening =
    routeKey !== undefined && opening.status === 'missing' && !editor.answers(routeKey)
      ? opening
      : undefined;
  const missing = missingOpening?.message;
  const missingName = missingOpening?.verbatim;

  useEffect(() => {
    if (landing !== undefined) {
      replaceRoute({ kind: 'library', filter: landing });
    }
  }, [landing]);

  useEffect(() => {
    if (missing !== undefined) {
      showToast(missing, { verbatim: missingName });
      replaceRoute(lastLibrary);
    }
  }, [missing, missingName, lastLibrary]);

  const toLibrary = (): void => {
    if (shownLoose !== undefined) {
      setLoose(undefined);
    } else if (libraryBelow()) {
      window.history.back();
    } else {
      pushRoute(lastLibrary);
    }
  };

  const deleteMine = async (ids: readonly string[]): Promise<void> => {
    sessionChanges.setState((before) => ids.reduce(withoutChange, before));

    if (route.kind !== 'library') {
      replaceRoute({ kind: 'library', filter: MINE_FILTER });
    }

    const mine = (await appStorage())?.mine;

    if (mine !== undefined) {
      await Promise.all(ids.map((id) => mine.remove(id)));
    }

    reloadLibrary();
  };

  const importFiles = async (files: readonly File[]): Promise<void> => {
    if ((await backup.importFiles(files)) > 0) {
      replaceRoute({ kind: 'library', filter: MINE_FILTER });
    }
  };

  const openLoose = (make: (id: number) => OpenMaze): void => {
    setLoose((before) => {
      const id = (before?.id ?? 0) + 1;
      return { open: make(id), at: hash, id };
    });
  };

  const mineNames = (library?.entries ?? [])
    .filter((entry) => entry.origin === 'mine')
    .map((entry) => entry.name);

  const openFile = async (picked: File): Promise<void> => {
    if (picked.size > MAX_FILE_BYTES) {
      showToast(`Could not read ${picked.name} (larger than 1 MiB). Pick a mazefiles .txt`, {
        verbatim: picked.name,
      });
      return;
    }

    const parsed = parseMazeText(await picked.text(), picked.name);

    if (parsed.ok) {
      openLoose((id) => ({
        key: looseKey('file', id),
        maze: parsed.value.maze,
        name: picked.name.replace(/\.txt$/i, ''),
        detail: 'Opened from a file',
        document: {
          ...looseDocument(parsed.value.trailer),
          source: parsed.value.source,
        },
      }));
    } else {
      showToast(`Could not read ${picked.name} (${parsed.error.message}). Pick a mazefiles .txt`, {
        verbatim: picked.name,
      });
    }
  };

  return (
    <TooltipProvider delayDuration={350} skipDelayDuration={300}>
      <a
        className="fixed top-safe-3 left-safe-3 z-40 -translate-y-[160%] rounded-[10px] bg-primary px-3 py-2 text-[13px] text-primary-foreground hover:bg-primary/90 focus-visible:translate-y-0"
        href={`#${CANVAS_ID}`}
        onClick={(event) => {
          event.preventDefault();
          focusContent();
        }}
      >
        Skip to the content
      </a>
      <Studio
        filter={route.kind === 'library' ? (landing ?? route.filter) : lastLibrary.filter}
        library={library}
        libraryFailed={libraryFailed}
        onFilter={(filter: LibraryFilter) => replaceRoute({ kind: 'library', filter })}
        onLibrary={toLibrary}
        mineNames={mineNames}
        onNew={(request) => openLoose((id) => openNewMaze(request, id, mineNames))}
        onOpenFile={(picked) => void openFile(picked)}
        onDiscard={(item) =>
          void discardChange(item, editor, (source) => {
            setLoose(undefined);
            replaceRoute(source ?? lastLibrary);
          })
        }
        onDelete={(ids) => void deleteMine(ids)}
        files={{
          onExportAll: () => void backup.exportAll(),
          onImport: (files) => void importFiles(files),
          onCheckUpdates: updates.checkNow,
        }}
        updateNote={library === undefined ? undefined : updateNote(updates.status, library.commit)}
        onPin={replaceRoute}
        editor={editor}
        opened={editor.shown ?? opened}
      />
      <ReportDialog onClose={backup.closeReport} report={backup.report} />
      <Toaster />
    </TooltipProvider>
  );
}
