import { useEffect, useState } from 'react';

import { loadSnapshot, type RepoFile } from '@/library/snapshot';
import { boardGeometry } from '@/render';
import { Board } from '@/ui/board/board';
import { useRoute } from '@/ui/hooks/use-route';
import { ArrowSquareOut } from '@/ui/icons';
import { Verbatim } from '@/ui/verbatim';

import { embedMaze, type Fetched, missingPath, type SnapshotLoad } from './embed-maze';
import { appHref } from './embed-url';
import { type FetchFile, fetchRepoFile } from './fetch-repo-file';
import { useEmbedTheme } from './use-embed-theme';

/** The space between the board and the edges of the frame, in CSS pixels. */
const MARGIN = 16;

/** What the link to the maze in the whole app says. */
const OPEN_IN_APP = 'Open in maze-studio';

/** The built-in snapshot, loaded once it is `wanted`, and only once. */
function useSnapshot(wanted: boolean): SnapshotLoad {
  const [snapshot, setSnapshot] = useState<SnapshotLoad>('loading');
  const load = wanted && snapshot === 'loading';

  useEffect(() => {
    if (!load) {
      return undefined;
    }

    let current = true;
    void loadSnapshot().then(
      (loaded) => {
        if (current) {
          setSnapshot(loaded);
        }
      },
      () => {
        if (current) {
          setSnapshot('failed');
        }
      }
    );

    return () => {
      current = false;
    };
  }, [load]);

  return snapshot;
}

/** The file at `path`, fetched when there is a path, and again if the path changes. */
function useFetchedFile(
  path: string | undefined,
  fetchFile: FetchFile | undefined
): Fetched | undefined {
  const [fetched, setFetched] = useState<{
    path: string;
    file: RepoFile | undefined;
  }>();

  useEffect(() => {
    if (path === undefined) {
      return undefined;
    }

    let current = true;
    void fetchRepoFile(path, fetchFile).then((file) => {
      if (current) {
        setFetched({ path, file });
      }
    });

    return () => {
      current = false;
    };
  }, [path, fetchFile]);

  if (path === undefined) {
    return undefined;
  }

  return fetched?.path === path ? { status: 'done', file: fetched.file } : { status: 'loading' };
}

/**
 * The embed (`?embed`): the maze of a repository or link route alone, fitted to the frame on the
 * desk, with a quiet link to it in the whole app in a corner. It is a picture, not a canvas: it
 * takes no wheel, pointer or key, so the page that frames it scrolls past it. A repository maze the
 * snapshot lacks is read from GitHub; other routes get a short sentence.
 *
 * @param props.fetchFile `fetch`, or a stand-in for it.
 */
export function Embed({ fetchFile }: { readonly fetchFile?: FetchFile } = {}) {
  useEmbedTheme();
  const route = useRoute();
  const snapshot = useSnapshot(route.kind === 'repo');
  const path = missingPath(route, snapshot);
  const fetched = useFetchedFile(path, fetchFile);
  const shown = embedMaze(route, snapshot, fetched);

  if (shown.status === 'waiting') {
    return <main className="fixed inset-0" />;
  }

  if (shown.status === 'missing') {
    return (
      <main className="fixed inset-0 grid place-items-center p-6">
        <p className="max-w-80 text-center text-[13px] text-muted-foreground">
          <Verbatim text={shown.message} verbatim={shown.verbatim} />
        </p>
      </main>
    );
  }

  const { width, height } = boardGeometry(shown.maze);
  const fit = `min(100vw - ${2 * MARGIN}px, (100vh - ${2 * MARGIN}px) * ${width / height})`;

  return (
    <main className="fixed inset-0 grid place-items-center overflow-hidden">
      <Board label={shown.label} maze={shown.maze} style={{ width: fit, height: 'auto' }} />
      <a
        className="fixed right-safe-2 bottom-safe-2 grid size-7 place-items-center rounded-lg bg-card/90 text-muted-foreground shadow-island transition-colors duration-100 ease-(--ease) hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        href={appHref(window.location.href)}
        rel="noopener noreferrer"
        target="_blank"
        title={OPEN_IN_APP}
      >
        <ArrowSquareOut size={16} />
        <span className="sr-only">{OPEN_IN_APP}</span>
      </a>
    </main>
  );
}
