import { useEffect, useRef, useState } from 'react';

import { DEFAULT_FILTER, type LibraryFilter } from '@/library';
import { parseMazeText } from '@/maze';

import { CANVAS_ID } from './canvas-id';
import { useMazeEditor } from './editor/use-maze-editor';
import { useRoute } from './hooks/use-route';
import { useLibrary } from './library/use-library';
import { pushRoute, replaceRoute } from './navigation';
import { looseDocument, MAX_FILE_BYTES, mazeKeyOf, openingOf, type OpenMaze } from './open-maze';
import { TooltipProvider } from './primitives/tooltip';
import { LIBRARY_ROUTE, parseRoute, routeHash, type Route } from './routes';
import { Studio } from './studio/studio';
import { Toaster } from './toaster';
import { showToast } from './toasts';

/** A maze opened from a file, shown while the URL stays where it was opened. */
interface OpenedFile {
  readonly open: OpenMaze;
  readonly at: string;
  /** Tells two files apart, even with the same name. */
  readonly id: number;
}

function focusCanvas(): void {
  document.getElementById(CANVAS_ID)?.focus();
}

/**
 * The whole app: the studio, showing the library or the maze the route opens, as edited, with the
 * toasts on top. A `.txt` file opens without a route of its own; the Library button closes it
 * (PLAN.md 3.4). A route that names the copy an edit has just made is not missing while the
 * library loads it.
 */
export function App() {
  const route = useRoute();
  const library = useLibrary();
  const hash = routeHash(route);
  const [file, setFile] = useState<OpenedFile | undefined>(undefined);
  const lastLibrary = useRef<Route>(LIBRARY_ROUTE);
  const fromLibrary = useRef(false);
  const previous = useRef<Route>(route);
  const opening = openingOf(route, library);
  const shownFile = file?.at === hash ? file.open : undefined;
  const [lastFilter, setLastFilter] = useState({ hash: '#/', filter: DEFAULT_FILTER });

  if (route.kind === 'library' && lastFilter.hash !== hash) {
    setLastFilter({ hash, filter: route.filter });
  }

  const opened = shownFile ?? (opening.status === 'open' ? opening.open : undefined);
  const editor = useMazeEditor({ opened, wanted: shownFile?.key ?? mazeKeyOf(route) });
  const routeKey = mazeKeyOf(route);
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
    if (missing !== undefined) {
      showToast(missing);
      replaceRoute(lastLibrary.current);
    }
  }, [missing]);

  const toLibrary = (): void => {
    if (shownFile !== undefined) {
      setFile(undefined);
    } else if (fromLibrary.current) {
      window.history.back();
    } else {
      pushRoute(lastLibrary.current);
    }
  };

  const openFile = async (picked: File): Promise<void> => {
    if (picked.size > MAX_FILE_BYTES) {
      showToast(`Could not read ${picked.name} (larger than 1 MiB). Pick a mazefiles .txt`);
      return;
    }

    const parsed = parseMazeText(await picked.text(), picked.name);

    if (parsed.ok) {
      setFile((before) => ({
        open: {
          key: `file:${(before?.id ?? 0) + 1}`,
          maze: parsed.value.maze,
          name: picked.name.replace(/\.txt$/i, ''),
          detail: 'Opened from a file',
          document: looseDocument(parsed.value.trailer),
        },
        at: hash,
        id: (before?.id ?? 0) + 1,
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
        filter={route.kind === 'library' ? route.filter : lastFilter.filter}
        library={library}
        onFilter={(filter: LibraryFilter) => replaceRoute({ kind: 'library', filter })}
        onLibrary={toLibrary}
        onOpenFile={(picked) => void openFile(picked)}
        onPin={replaceRoute}
        editor={editor}
        opened={editor.shown ?? opened}
      />
      <Toaster />
    </TooltipProvider>
  );
}
