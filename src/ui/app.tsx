import { useEffect, useRef, useState } from 'react';

import { fileStem, type LibraryFilter } from '@/library';
import { parseMazeText } from '@/maze';

import { useRoute } from './hooks/use-route';
import { LibraryScreen } from './library/library-screen';
import { useLibrary } from './library/use-library';
import { MazeScreen } from './maze/maze-screen';
import { pushRoute, replaceRoute } from './navigation';
import { openingOf, type OpenMaze } from './open-maze';
import { TooltipProvider } from './primitives/tooltip';
import { LIBRARY_ROUTE, parseRoute, routeHash, type Route } from './routes';
import { Toaster } from './toaster';
import { showToast } from './toasts';

/** A maze opened from a file, shown while the URL stays where it was opened. */
interface OpenedFile {
  readonly open: OpenMaze;
  readonly at: string;
}

function focusCanvas(): void {
  document.querySelector<HTMLElement>('[role="application"]')?.focus();
}

/**
 * The whole app: the library, or the maze the route opens, with the toasts on top. A `.txt` file
 * opens without a route of its own; the Library button closes it (PLAN.md 3.4).
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

  const missing =
    route.kind !== 'library' && opening.status === 'missing' ? opening.message : undefined;

  useEffect(() => {
    const current = parseRoute(hash);
    fromLibrary.current = previous.current.kind === 'library' && current.kind !== 'library';
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
    const parsed = parseMazeText(await picked.text(), picked.name);

    if (parsed.ok) {
      setFile({
        open: {
          maze: parsed.value.maze,
          name: fileStem(picked.name),
          detail: 'Opened from a file',
        },
        at: hash,
      });
    } else {
      showToast(`Could not read ${picked.name} (${parsed.error.message}). Pick a mazefiles .txt`);
    }
  };

  const shownMaze = shownFile ?? (opening.status === 'open' ? opening.open : undefined);

  return (
    <TooltipProvider delayDuration={350} skipDelayDuration={300}>
      <a
        className="fixed top-3 left-3 z-40 -translate-y-[160%] rounded-[10px] bg-primary px-3 py-2 text-[13px] text-primary-foreground focus-visible:translate-y-0"
        href="#canvas"
        onClick={(event) => {
          event.preventDefault();
          focusCanvas();
        }}
      >
        Skip to the canvas
      </a>
      {shownMaze === undefined ? (
        route.kind === 'library' ? (
          <LibraryScreen
            filter={route.filter}
            library={library}
            onFilter={(filter: LibraryFilter) => replaceRoute({ kind: 'library', filter })}
            onOpenFile={(picked) => void openFile(picked)}
          />
        ) : null
      ) : (
        <MazeScreen key={shownMaze.name} onLibrary={toLibrary} open={shownMaze} />
      )}
      <Toaster />
    </TooltipProvider>
  );
}
