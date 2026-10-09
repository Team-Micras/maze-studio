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
  `setGoals` and `toggleGoal`. The start and the goals never overlap: the last one set wins.
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

`tests/maze/mazefiles-corpus.test.ts` reads every file of `vendor/mazefiles` at the pinned commit:
blob SHA, byte-for-byte round trip and compact-code round trip.
It also checks that no file has an `error` under its folder's profile, and pins how many files each
proof rule fires on. `tests/maze/round-trip-properties.test.ts` does the same over random mazes from a fixed seed, with
open borders, which the repository never has.

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
`tests/config/vitest-projects.test.ts` guards that split.
