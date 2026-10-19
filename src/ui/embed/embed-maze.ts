/**
 * Which maze the embed shows for a route: a maze of the built-in snapshot or of a link. My mazes and
 * the folder live in the visitor's own browser, which a page of another site has no business
 * showing, so the embed refuses them, and the library with them.
 *
 * @module
 */

import { repoCatalog } from "@/library/catalog";
import type { RepoFile, Snapshot } from "@/library/snapshot";
import { decodeMazeCode, type Maze } from "@/maze";
import { artboardLabel } from "@/ui/labels";
import { openingOf } from "@/ui/open-maze";
import type { Route } from "@/ui/routes";

/** What the embed shows for a route: nothing yet, a maze, or a sentence saying why not. */
export type EmbedMaze =
  | { readonly status: "waiting" }
  | {
      readonly status: "open";
      readonly maze: Maze;
      readonly name: string;
      /** What a screen reader says for the board, as for an artboard: name, competition, size. */
      readonly label: string;
    }
  | {
      readonly status: "missing";
      readonly message: string;
      /** The path the message names, which a page translator must leave alone. */
      readonly verbatim?: string;
    };

/** The built-in snapshot, or where its loading stands. */
export type SnapshotLoad = Snapshot | "loading" | "failed";

/** What the embed says when the built-in snapshot does not load. */
export const SNAPSHOT_FAILED = "The mazes did not load. Reload to try again";

/** What the embed says for a repository path it lacks; never the path, which another site chose. */
export const EMBED_MISSING = "No maze at that path";

/** What the embed says for a route it does not show. */
export const EMBED_REFUSED =
  "This embed shows a maze of the repository or a link";

/** A repository file the snapshot lacks: being fetched, or what the fetch found if anything. */
export type Fetched =
  | { readonly status: "loading" }
  | { readonly status: "done"; readonly file: RepoFile | undefined };

/** The file of `snapshot` at `path`, if it holds one. */
export function snapshotFile(
  snapshot: Snapshot,
  path: string,
): RepoFile | undefined {
  return snapshot.files.find((candidate) => candidate.path === path);
}

/** The path of a repository route that a loaded `snapshot` lacks, or `undefined` for any other case. */
export function missingPath(
  route: Route,
  snapshot: SnapshotLoad,
): string | undefined {
  return route.kind === "repo" &&
    typeof snapshot === "object" &&
    snapshotFile(snapshot, route.path) === undefined
    ? route.path
    : undefined;
}

/**
 * The maze the embed shows at `route`, from `snapshot` for a repository route, or from `fetched`
 * when the snapshot lacks the file; a link needs neither.
 */
export function embedMaze(
  route: Route,
  snapshot: SnapshotLoad,
  fetched?: Fetched,
): EmbedMaze {
  switch (route.kind) {
    case "link": {
      const opening = openingOf(route, undefined);

      if (opening.status !== "open") {
        return opening;
      }

      const { maze, name } = opening.open;
      return {
        status: "open",
        maze,
        name,
        label: artboardLabel({ name, width: maze.width, height: maze.height }),
      };
    }
    case "repo": {
      if (snapshot === "loading") {
        return { status: "waiting" };
      }

      if (snapshot === "failed") {
        return { status: "missing", message: SNAPSHOT_FAILED };
      }

      const inSnapshot = snapshotFile(snapshot, route.path);

      if (inSnapshot === undefined && fetched?.status === "loading") {
        return { status: "waiting" };
      }

      const file =
        inSnapshot ?? (fetched?.status === "done" ? fetched.file : undefined);
      const [entry] = file === undefined ? [] : repoCatalog([file]);
      const decoded =
        file === undefined || entry === undefined
          ? undefined
          : decodeMazeCode(file.code);

      if (decoded?.ok !== true || entry === undefined) {
        return { status: "missing", message: EMBED_MISSING };
      }

      return {
        status: "open",
        maze: decoded.value.maze,
        name: entry.name,
        label: artboardLabel(entry),
      };
    }
    default:
      return { status: "missing", message: EMBED_REFUSED };
  }
}
