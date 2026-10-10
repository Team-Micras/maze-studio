import { useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';

import { DEFAULT_FILTER, type LibraryFilter } from '@/library';
import { parseMazeText } from '@/maze';

import { CANVAS_ID } from './canvas-id';
import { ConfirmDialog } from './confirm-dialog';
import {
  changeOf,
  sessionChanges,
  withoutChange,
  type ChangeItem,
} from './changes/session-changes';
import { newMazeName, openNewMaze } from './new-maze';
import { useMazeEditor } from './editor/use-maze-editor';
import { useRoute } from './hooks/use-route';
import { useLocalFolder } from './library/use-local-folder';
import { reloadLibrary, useLibrary } from './library/use-library';
import { pushRoute, replaceRoute } from './navigation';
import {
  looseDocument,
  MAX_FILE_BYTES,
  mazeKeyOf,
  NO_FOLDER_ACCESS,
  openingOf,
  type OpenMaze,
} from './open-maze';
import { TooltipProvider } from './primitives/tooltip';
import { LIBRARY_ROUTE, parseRoute, routeHash, type Route } from './routes';
import { Studio } from './studio/studio';
import { Toaster } from './toaster';
import { appStorage } from './storage';
import { showToast } from './toasts';

/**
 * The maze on screen at the route before this one, if any: leaving a maze of Mine changed in the
 * session for the library shows Mine, so the flight lands on it.
 */
interface RouteTrail {
  readonly hash: string;
  readonly key: string | undefined;
  readonly left: string | undefined;
}

/** The library's filter after leaving a maze of Mine changed in the session (PLAN.md 3.4). */
const MINE_FILTER: LibraryFilter = { ...DEFAULT_FILTER, source: 'mine' };

/** A maze opened from a file or made new, shown while the URL stays where it was opened. */
interface LooseMaze {
  readonly open: OpenMaze;
  readonly at: string;
  /** Tells two loose mazes apart, even with the same name. */
  readonly id: number;
}

function focusCanvas(): void {
  document.getElementById(CANVAS_ID)?.focus();
}

/**
 * The whole app: the studio, showing the library or the maze the route opens, as edited, with the
 * toasts on top. A `.txt` file and a new maze open without a route of their own; the Library button
 * closes them (PLAN.md 3.4). A route that names the copy an edit has just made is not missing
 * while the library loads it. Leaving a maze of Mine changed in the session lands on it, in Mine,
 * and Discard of the Changes panel deletes a copy or puts back a maze of Mine, leaving it if open.
 */
export function App() {
  const route = useRoute();
  const folder = useLocalFolder();
  const library = useLibrary(folder.contents);
  const hash = routeHash(route);
  const [loose, setLoose] = useState<LooseMaze | undefined>(undefined);
  const [onDisk, setOnDisk] = useState<{ fileName: string; text: string } | undefined>(undefined);
  const lastLibrary = useRef<Route>(LIBRARY_ROUTE);
  const fromLibrary = useRef(false);
  const previous = useRef<Route>(route);
  const opening = openingOf(route, library, folder.restoring);
  const shownLoose = loose?.at === hash ? loose.open : undefined;
  const [lastFilter, setLastFilter] = useState({ hash: '#/', filter: DEFAULT_FILTER });

  if (route.kind === 'library' && lastFilter.hash !== hash) {
    setLastFilter({ hash, filter: route.filter });
  }

  const opened = shownLoose ?? (opening.status === 'open' ? opening.open : undefined);
  const editor = useMazeEditor({ opened, wanted: shownLoose?.key ?? mazeKeyOf(route) });
  const routeKey = mazeKeyOf(route);
  const changes = useStore(sessionChanges);
  const screenKey = editor.shown?.key;
  const [trail, setTrail] = useState<RouteTrail>({ hash, key: screenKey, left: undefined });

  if (trail.hash !== hash) {
    setTrail({ hash, key: screenKey, left: trail.key });
  } else if (screenKey !== undefined && screenKey !== trail.key) {
    setTrail({ ...trail, key: screenKey });
  }

  const landing =
    route.kind === 'library' &&
    route.filter.source !== 'mine' &&
    trail.left?.startsWith('mine:') === true &&
    changeOf(changes, trail.left.slice('mine:'.length)) !== undefined
      ? MINE_FILTER
      : undefined;
  const missing =
    routeKey !== undefined && opening.status === 'missing' && !editor.answers(routeKey)
      ? opening.message
      : undefined;

  useEffect(() => {
    const current = parseRoute(hash);
    fromLibrary.current =
      current.kind !== 'library' && (previous.current.kind === 'library' || fromLibrary.current);
    previous.current = current;

    if (current.kind === 'library') {
      lastLibrary.current = current;
    }
  }, [hash]);

  useEffect(() => {
    if (landing !== undefined) {
      replaceRoute({ kind: 'library', filter: landing });
    }
  }, [landing]);

  useEffect(() => {
    if (missing !== undefined) {
      showToast(missing);
      replaceRoute(lastLibrary.current);
    }
  }, [missing]);

  const toLibrary = (): void => {
    if (shownLoose !== undefined) {
      setLoose(undefined);
    } else if (fromLibrary.current) {
      window.history.back();
    } else {
      pushRoute(lastLibrary.current);
    }
  };

  const discard = async (item: ChangeItem): Promise<void> => {
    const shown = editor.shown;
    const open = shown?.key === `mine:${item.id}`;
    const mine = (await appStorage())?.mine;

    if (item.kind !== 'existing') {
      sessionChanges.setState((before) => withoutChange(before, item.id));

      if (open) {
        setLoose(undefined);
        replaceRoute(item.source ?? lastLibrary.current);
      }

      await mine?.remove(item.id);
      reloadLibrary();
      return;
    }

    const stored = await mine?.get(item.id);
    const saved =
      mine === undefined || stored === undefined || item.baseline === undefined
        ? undefined
        : await mine.save(
            item.id,
            {
              maze: item.baseline,
              ...(item.baselineProfile === undefined ? {} : { profile: item.baselineProfile }),
            },
            editor.savedVersion(item.id) ?? stored.version
          );

    if (saved?.ok !== true) {
      showToast(`Could not discard ${item.name} (changed in another tab)`);
      return;
    }

    sessionChanges.setState((before) => withoutChange(before, item.id));
    reloadLibrary();

    if (open && shown !== undefined) {
      editor.reopen({
        ...shown,
        maze: item.baseline ?? shown.maze,
        document: {
          ...shown.document,
          profile: item.baselineProfile ?? shown.document.profile,
          mine: { id: item.id, version: saved.value.version },
        },
      });
    }
  };

  const saveToFolder = async (fileName: string, text: string, overwrite = false): Promise<void> => {
    const saved = await folder.save(fileName, text, overwrite);

    if (saved.ok) {
      showToast(`Saved to ${fileName}`);
    } else if (saved.changed === true) {
      setOnDisk({ fileName, text });
    } else {
      showToast(`Could not save to ${fileName} (${saved.reason})`);
    }
  };

  const deleteMine = async (id: string): Promise<void> => {
    sessionChanges.setState((before) => withoutChange(before, id));
    replaceRoute({ kind: 'library', filter: MINE_FILTER });
    await (await appStorage())?.mine.remove(id);
    reloadLibrary();
  };

  const openFolder = async (): Promise<void> => {
    try {
      await folder.open();
      replaceRoute({ kind: 'library', filter: { ...DEFAULT_FILTER, source: 'folder' } });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        showToast(NO_FOLDER_ACCESS);
      }
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
      showToast(`Could not read ${picked.name} (larger than 1 MiB). Pick a mazefiles .txt`);
      return;
    }

    const parsed = parseMazeText(await picked.text(), picked.name);

    if (parsed.ok) {
      openLoose((id) => ({
        key: `file:${id}`,
        maze: parsed.value.maze,
        name: picked.name.replace(/\.txt$/i, ''),
        detail: 'Opened from a file',
        document: {
          ...looseDocument(parsed.value.trailer),
          ...(parsed.value.source === undefined ? {} : { source: parsed.value.source }),
        },
      }));
    } else {
      showToast(`Could not read ${picked.name} (${parsed.error.message}). Pick a mazefiles .txt`);
    }
  };

  return (
    <TooltipProvider delayDuration={350} skipDelayDuration={300}>
      <nav aria-label="Skip link">
        <a
          className="fixed top-3 left-3 z-40 -translate-y-[160%] rounded-[10px] bg-primary px-3 py-2 text-[13px] text-primary-foreground focus-visible:translate-y-0"
          href={`#${CANVAS_ID}`}
          onClick={(event) => {
            event.preventDefault();
            focusCanvas();
          }}
        >
          Skip to the canvas
        </a>
      </nav>
      <Studio
        filter={route.kind === 'library' ? (landing ?? route.filter) : lastFilter.filter}
        library={library}
        onFilter={(filter: LibraryFilter) => replaceRoute({ kind: 'library', filter })}
        onLibrary={toLibrary}
        newName={newMazeName('', mineNames)}
        onNew={(request) => openLoose((id) => openNewMaze(request, id, mineNames))}
        onOpenFile={(picked) => void openFile(picked)}
        onDiscard={(item) => void discard(item)}
        onDelete={(id) => void deleteMine(id)}
        onSaveToFolder={(fileName, text) => void saveToFolder(fileName, text)}
        {...(folder.supported ? { onOpenFolder: () => void openFolder() } : {})}
        onPin={replaceRoute}
        editor={editor}
        opened={editor.shown ?? opened}
      />
      <ConfirmDialog
        confirm="Save anyway"
        description="It changed since the app read it. Saving replaces what is in it now."
        onConfirm={() => {
          if (onDisk !== undefined) {
            void saveToFolder(onDisk.fileName, onDisk.text, true);
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setOnDisk(undefined);
          }
        }}
        open={onDisk !== undefined}
        title={`${onDisk?.fileName ?? ''} changed on disk`}
      />
      <Toaster />
    </TooltipProvider>
  );
}
