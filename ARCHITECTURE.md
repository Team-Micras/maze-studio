# Architecture

maze-studio is a static React app built with Vite and served as a PWA. Everything runs in the
browser; there is no server.

## Folders

| Folder             | What it holds                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `src/maze/`        | The core: the maze model, the text format, the compact code, edits, history and validation. No React, no browser APIs. |
| `src/library/`     | The catalog of mazes, the built-in snapshot, updates from GitHub and storage.                                          |
| `src/render/`      | Geometry, the SVG drawing of a maze and thumbnails.                                                                    |
| `src/ui/`          | The React interface; `src/ui/primitives/` holds the shadcn components.                                                 |
| `src/main.tsx`     | The entry point: mounts the app and registers the service worker.                                                      |
| `sw/`              | The service worker (Workbox, `injectManifest`).                                                                        |
| `scripts/`         | Node tools run with Bun, such as the bundle size report.                                                               |
| `tests/`           | Mirrors `src/`: `src/maze/x.ts` is tested by `tests/maze/x.test.ts`.                                                   |
| `vendor/mazefiles` | The mazefiles repository as a submodule, pinned to the snapshot's commit.                                              |

## The maze core

`src/maze/index.ts` is its public face:

- `maze.ts`: `Maze`, `Cell`, `createMaze` (checks sizes 1 to 64, wall counts, cells inside, goals
  unique and never the start), edge and cell indices, `mazesEqual`. Walls are two immutable `Bits`
  sets (`bits.ts`), `horizontal` with `(height + 1) × width` edges and `vertical` with
  `height × (width + 1)`, `(0, 0)` in the south-west corner.
- `maze-text.ts`, `parse-maze-text.ts`, `serialize-maze-text.ts`: the mazefiles text as a
  `MazeText` of grid and trailer. The grid ends by its shape (see the parser's header); what the
  canonical text writes differently is an `Irregularity` in `source`, never a refusal; what does
  not fit the shape is refused with line and column.
- `edges.ts`, `edits.ts`: edges by coordinates (`Edge`, `edgeOfCell`, `hasWall`) and the edits
  of the editor as pure functions that return the same maze when nothing changes: `setWall`,
  `toggleWall`, `paintWalls` (a list of edges gets one value; which edges a pointer path crosses
  is the geometry's job in `src/render`), `wallRectangle`, `clearArea`, `fillBorder`, `setStart`, `clearStart`,
  `setGoals`, `setGoalArea` and `toggleGoal`. The start and the goals never overlap: the last one
  set wins.
- `new-maze.ts`: the New maze menu's mazes, Classic, Half size and Training, and a bordered maze
  of any size.
- `history.ts`: undo and redo over immutable values, 500 steps. `record` makes a step;
  between `beginGesture` and `endGesture` it only changes the present, and the end makes one step
  of the whole gesture, such as a drag, or none if it came back to where it began.
- `validation.ts`, `validation-types.ts`, `validation-rules.ts`, `maze-proofs.ts`:
  `validateMaze({ maze, profile, source? })` returns findings, never throws. Each `Finding` has
  a rule, a severity (`error`, `warning` or `hint`, by profile in `RULE_SEVERITIES`), a message and
  the cells, edges and posts to point at. The file rules read `source` and stop applying once the
  document is edited; `profileOfPath` gives a repository path its folder's profile.
- `maze-code.ts`: the compact code, version 1, for links and the snapshot, with `base64url.ts` and
  `bytes.ts`. The decoder refuses with a `MazeCodeRejection` and a message, never by throwing.
- `diff.ts`: `diffMazes(before, after)`, the walls put and taken, the goal cells marked and
  unmarked and the start on both sides, or `undefined` when the sizes differ; `isEmptyDiff`.
  `tests/maze/diff.test.ts` checks it against the pairs of `tests/fixtures/diff/`, each with its
  counts written by hand.

`tests/maze/mazefiles-corpus.test.ts` reads every file of `vendor/mazefiles` at the pinned commit:
blob SHA, byte-for-byte round trip and compact-code round trip, no irregularity, and no `error`
under its folder's profile. It fixes no count of one commit, only a floor of 500 files, and logs
the sizes and how many files each rule fires on. `tests/maze/round-trip-properties.test.ts` does the same over random mazes from a fixed seed, with
open borders, which the repository never has.

## The library

`src/library/index.ts` is its public face. It imports only `src/maze`.

- `snapshot.ts`, `snapshot.json`: every maze file of the pinned mazefiles commit as path, git blob
  SHA and compact code, generated (never committed) by `bun run snapshot`
  (`scripts/snapshot-mazefiles.ts`), which the `pre` scripts of `dev`, `build`, `lint`,
  `typecheck` and the tests run, and loaded by `loadSnapshot()` from its own chunk. `tests/library/snapshot.test.ts` compares it with the
  submodule file by file and byte by byte: it is the anchor of the pinned hash.
- `github-updater.ts`: `updateFromGitHub` asks the branch (with `If-None-Match`), lists the tree of
  a new commit, downloads only new or changed files from the raw host by commit, checks each blob
  SHA, skips a file that does not parse, and fails without changing anything on no network, the
  rate limit, a SHA mismatch or a malformed answer. `isUpdateDue` allows one automatic check a day.
- `repo-cache.ts`: `RepoCache` shows the snapshot until an update stores a newer commit in
  IndexedDB, and remembers the last check and its failure.
- `mine.ts`: `MineLibrary`, the user's mazes with a version per item. A save names the version
  it was made from and is refused over a newer one or a removed item. Every write is announced on
  a `BroadcastChannel`, and the first write asks for `navigator.storage.persist()`.
- `backup.ts`, `zip.ts`, `file-names.ts`: export of My mazes as a stored zip of `.txt` files with an
  index, and import of `.txt` files and zips, deflated ones included.
- `catalog.ts`, `maze-names.ts`: one entry per maze for search and filters, with the competition
  and year read from the file name by a fixed list, without guessing.
- `search.ts`, `library-filter.ts`: the search index of DESIGN.md 6.3 (`SearchIndex`, every token
  must start a word of the name, competition, year or size) and the library's filter: source,
  category and query, applied by `filterCatalog`.
- `database.ts`, `settings.ts`: a small IndexedDB wrapper with the stores `repo-files`, `mine`
  and `settings`, and the preferences and local folder kept in the last.

## Drawing

`src/render/index.ts` is its public face. It imports only `src/maze`, and never React.

- `geometry.ts`: a maze drawn with its longest side 640 world units (`ARTBOARD_SIZE`), board or
  thumbnail proportions (DESIGN.md 2.2), maze points in cells (`u` east, `v` north) and board
  points, cell, wall and slot rectangles, `nearestEdge` within 0.32 cell and the cells under a
  point.
- `track-layers.ts`, `overlay-layers.ts`, `path.ts`, `track-colors.ts`: the track and the editor's
  overlays as SVG path data, one string per layer in the order of DESIGN.md 2.2 and 2.3, walls and
  posts split red and bare by the paint rule; the same strings feed a canvas `Path2D`.
- `board-placement.ts`: a board placed in a world rectangle as its SVG is (centred, cells square):
  the maze point under a world point, a cell's or an area's world rectangle, the cells a finding
  points at (`focusArea`), and a cell's side on screen, which must reach 28 px (`MIN_TOUCH_CELL`)
  for a touch to edit.
- `stroke.ts`: the wall stroke of PLAN.md 3.4, walking the post grid with a step of 0.6 cell, with
  turns, the axis lock of Shift and every post of a fast move; `applyStroke` paints it with
  `paintWalls`.
- `camera.ts`, `camera-input.ts`, `easing.ts`: the camera `{ x, y, k }` as pure functions: fit
  between insets, zoom range and the 96 px pan limit, zoom at a point, pinch, centring, the flight
  path (straight on screen, geometric in size) and the curves of DESIGN.md 8, the camera that puts
  a board over a rectangle on screen (where a flight starts and lands), the move that reveals a
  cell; what a wheel event or a zoom key asks (DESIGN.md 7).
- `minimap.ts`: when the minimap shows (past 1.06 times the fit), its frame, the visible area on
  it and the world point under a click.
- `library-layout.ts`: the library's grid on the page, in CSS pixels (2 to 6 columns that fill the
  width, square slots, gaps of 200/640 and 210/640 of a slot), where a maze's thumbnail lies, the
  rows a scroll position keeps mounted and the scroll that reveals a slot.
- `thumbnails.ts`, `lru-cache.ts`: thumbnails painted on an `OffscreenCanvas` in bands of 64, 128,
  256 and 512 pixels, in an LRU bounded at 64 MB of bitmaps; `diffThumbnail` keeps those with a
  diff on top under their own key. `paintTrack` paints on any 2D context.

`src/ui/board/` turns these into components, mounted alone in the browser tests: `Board` (the
SVG, a path per layer), `CameraStage` and `useBoardCamera` (the canvas the board lies on, with
wheel, pinch, Space or middle-button drag and the zoom keys, and a drawing gesture for the
content that a second finger takes back), `Minimap` (which paints the live
maze outside the cache), `ThumbnailCanvas` with the app's one `thumbnailCache`, and
`CursorStatus`.

## The screens

`src/ui/app.tsx` is the shell: it reads the route from the hash (`routes.ts`, `navigation.ts`,
`hooks/use-route.ts`), loads the library (`library/use-library.ts`, over `storage.ts`, which opens
IndexedDB once), and shows the library or the maze the route opens (`open-maze.ts`), with the
toasts (`toasts.ts`, `toaster.tsx`; a toast may carry an action or stay until closed) and the theme
(`theme.ts`). `main.tsx` registers the service worker (`sw/sw.ts`, which precaches the whole build,
the snapshot's chunk included, so the app opens and edits offline) and, when a new version waits,
`new-version.ts` offers it in a persistent "New version." toast with Reload. The studio flies between the
library, a grid the browser scrolls, and a maze on a canvas above it (DESIGN.md 8); the camera
hook (`board/use-canvas-camera.ts`) runs the flight, free of the limits while it lasts.

- `studio/`: `Studio` puts the library grid on the page and the open maze on a canvas above it,
  with the flights between them (`use-studio-flight.ts` runs them from a thumbnail on screen and
  back onto it, `studio-store.ts` holds the mode and the tool), the open board (`OpenBoard`), the editor's islands (`EditorChrome`) and the quick list
  (`MazeList`, `list-order.ts`).
- `editor/`: editing the maze on screen. `edit-session.ts` is pure: the history, one step per
  gesture, and the copy in My mazes the first edit makes; `use-maze-editor.ts` keeps the session in
  `App`, so a route that names a copy just made is never missing, and `mine-writer.ts` copies and
  autosaves, one write at a time. `use-wall-drawing.ts` turns the stage's gestures into strokes,
  `use-cell-drawing.ts` the rectangle, clear area, start and goal (`cellEdit` is pure),
  `use-board-keys.ts` runs the cell cursor and Enter's corners, `use-editor-shortcuts.ts` the keys
  on the page; `tools.ts` names the tools, and `ToolsIsland`, `ToolHint` and `EditControls` are the
  tools, the hint and the phone's Edit button. `Checks` (with `checks-summary.ts`) is the chip and
  the panel, `MoreActions` the ⋯ menu and `ShortcutHelp` the `?` dialog. `studio/use-studio-editing.ts`
  wires them into the studio.
- `editor/share.ts`, `RenameDialog`, `TitleActions`: the link, the download, Save to My mazes and Save
  to folder, and Rename; `studio/use-maze-actions.ts` puts them in the menu and the islands, and
  `library/use-local-folder.ts` keeps the local folder over `src/library/folder.ts`.
- `changes/`: the session's Changes, `session-changes.ts` (pure, one store per tab) and
  `ChangesChip` and `ChangesPanel`; `studio/use-studio-changes.ts` wires them into the studio, and
  `App` discards.
- `library/`: `LibraryChrome` draws the library's islands (search, source and category, the
  "My mazes and files" menu of `mine-and-files.tsx`, Open, New maze with `new-maze-button.tsx`,
  `new-maze-menu.tsx` and its Custom size dialog, theme, and the credit with the note of
  `update-note.ts`), and `new-maze.ts` in `src/ui` makes the maze it asks for. `use-mine-backup.ts`
  runs Export all and Import (`backup-report.ts` words them, `ReportDialog` shows the reports), and
  `use-repo-updates.ts` asks GitHub once a day and on Check for updates. `EmptyLibrary` is an empty
  My mazes, with New maze, or a search that finds nothing; `LibraryGrid` mounts the rows of
  `Artboard`s on screen, keeps the focused one, scrolls to the one Tab reaches under an island,
  and fades out while a maze is open.
- `islands/`: the island, its buttons, separator and tooltip, the editor's zoom island and the
  theme button.
- `board/`: as above, plus `paint-queue.ts`, which paints thumbnails in idle time.
- `primitives/`: the shadcn components.
- `icons.tsx`: the Phosphor icons the app uses, one component each in the regular weight, written by
  `scripts/icons.ts` from `@phosphor-icons/core`; nothing in `src` imports a Phosphor package.

## Import rules

Checked by `bun run lint` through `no-restricted-imports` in `.oxlintrc.json`, and the rules
themselves by `tests/config/import-fences.test.ts`, which lints probe files, static and dynamic `import()`, against them.

| Folder         | May import                       | Never imports                                        |
| -------------- | -------------------------------- | ---------------------------------------------------- |
| `src/maze/`    | its own files, by relative path  | anything else of the project, React, `node:` modules |
| `src/library/` | `src/maze`, its own files        | `src/render`, `src/ui`, React                        |
| `src/render/`  | `src/maze`, its own files        | `src/library`, `src/ui`, React                       |
| `src/ui/`      | all of `src/` but `src/main.tsx` |                                                      |
| `scripts/`     | `src/maze`, `src/library`        | `src/render`, `src/ui`, tests, React                 |
| any of `src/`  |                                  | `tests/`, `scripts/`, `vendor/`                      |

## Tests

Four Vitest projects, run one after the other: `unit` (`tests/**/*.test.ts`, Node), `browser`
(`tests/**/*.test.tsx`, Chromium through Playwright), `performance` (`*-performance.test.ts(x)`,
Chromium, one file at a time, outside the check) and `e2e` (`tests/e2e/`, which builds the app
under `/maze-studio/` into `node_modules/.tmp/` and drives it with Playwright).
`tests/config/vitest-projects.test.ts` guards that split. The e2e project builds the app once,
in its global setup (`tests/support/e2e/serve-app.ts`), for all its files; one of them,
`production-frames.test.ts`, measures the built library's scroll and the flights into a
maze and back at 4× the reference notebook's slowness, the throttle calibrated to the machine.

Every row of DESIGN.md 12, the empty and error states, has a test: the ones slice 7 added are in
`tests/e2e/states.test.ts` (maze list filter, persistence, Export with a skipped maze, Import,
failed update check), `tests/e2e/files.test.ts` (Save to folder fails, Open folder absent),
`tests/ui/new-version.test.tsx`, `tests/ui/library/artboard.test.tsx` (thumbnail not drawn yet)
and `tests/ui/library/library-screen.test.tsx` (empty My mazes, no result); the rest sit with their
feature's tests. `tests/e2e/pwa.test.ts` opens, searches, edits and saves offline after a first
visit.

Browser tests share what is in `tests/support/ui/`: `BoardHarness` mounts a board on its stage
with the minimap and the cursor status, `frames.ts` measures motion as DESIGN.md 8 says (p95 at or
below 20 ms, at most 1 % of frames over 25 ms, the median of three runs), and `touch.ts` sends real
touches, `throttle.ts` slows the CPU through the DevTools protocol, and `library-app.tsx` mounts
the whole app on a route. Reference screenshots live in `screenshots/` next to their test and are
committed.
