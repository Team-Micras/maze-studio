# Architecture

maze-studio is a static React app built with Vite and served as a PWA. Everything runs in the browser; there is no
server. The reasons behind the choices below are in [`decisions.md`](decisions.md).

## Folders

| Folder             | What it holds                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| `src/maze/`        | The core: the model, the text format, the compact code, edits, history, diff and validation.           |
| `src/library/`     | The catalog, the built-in snapshot, updates from GitHub, My mazes, backup and IndexedDB.               |
| `src/render/`      | Geometry, the camera as pure functions, SVG path data and canvas thumbnails.                           |
| `src/generator/`   | The maze generator: settings, presets, styles, the time model, recipes, features and the batch pick.   |
| `src/ui/`          | The React interface; `src/ui/primitives/` holds the shadcn components.                                 |
| `src/main.tsx`     | The entry point: loads the app, or the embed with `?embed`, and registers the app's service worker.    |
| `sw/`              | The service worker (Workbox, `injectManifest`): precaches the build and serves it offline.             |
| `scripts/`         | Bun tools: the snapshot, the icons, the bundle size report.                                            |
| `tests/`           | Mirrors `src/`: `src/maze/x.ts` is tested by `tests/maze/x.test.ts`.                                   |
| `vendor/mazefiles` | The mazefiles repository as a submodule; `bun run snapshot` turns it into `src/library/snapshot.json`. |

## Layers

Each of `src/maze`, `src/library`, `src/render` and `src/generator` has an `index.ts` as its public face; `src/render`
has a second one, `loading.ts` (`@/render/loading`), which only the generator's chunk imports.

- **`src/maze`** is pure: no React, no browser API. `Maze` holds walls as two immutable `Bits` sets, `(0, 0)` in the
  south-west corner. The text format reads into a `MazeText` of grid and trailer, reporting what the canonical text
  writes differently as irregularities. Edits are pure functions that return the same maze when nothing changes.
  `history.ts` makes one undo step per gesture. `validateMaze` returns findings, never throws. `diffMazes` compares
  two mazes of one size.
- **`src/library`** reads the snapshot, the cache of a newer commit (`repo-cache.ts`, `github-updater.ts`), My mazes
  (`mine.ts`, a version per item and the generator's recipe of a generated one, writes announced to other tabs) and
  the backup zip. `catalog.ts` makes one entry per maze, under the key `maze-key.ts` gives it
  (`repo:<path>`, `mine:<id>`), which the app uses everywhere; `search.ts` and `library-filter.ts`
  filter them. `database.ts` is the small IndexedDB wrapper under all of it.
- **`src/render`** draws without React: `geometry.ts` and `board-placement.ts` place a board in the world,
  `track-layers.ts` and `overlay-layers.ts` give one SVG path per layer, a straight run of walls as one shape,
  `maze-svg.ts` writes the board as a standalone SVG file, `stroke.ts` turns a pointer path into walls,
  `camera.ts` and `camera-input.ts` hold the camera `{ x, y, k }` and its flights, `library-layout.ts` the grid,
  `thumbnails.ts` the bitmaps in an LRU of 64 MB. `loading.ts` paints the generator's grey loading skeletons from
  plain wall bytes: the wave over a decorative maze, and the board's routes tried then newest snapshot that reads
  as a maze; it stays out of `index.ts`, which the first screen imports, so that the first screen does not load it.
- **`src/generator`** builds mazes from settings and a seed, deterministically on every engine: the same seed gives the
  same walls, which `wallHash` locks in each recipe under `GENERATOR_VERSION`. It works on a `Grid` of one wall byte
  per cell (`grid.ts`, with `fromMaze` and `toMaze` to the app's `Maze`). `generator.ts` draws a seed's roles and style
  and builds it routes first (`routes.ts`: a racing and a careful route, a forest off them, loops) or by annealing a
  grown tree, against `Targets` (`types.ts`); `racing.ts` is the run-time model of three robot classes, `search.ts`
  the wall follower and the flood-fill round trip, `sensor.ts` the sensor motifs, `analysis.ts` and `rules.ts` the
  numbers and board rules. `presets.ts`, `features.ts`, `diversity.ts` and `batch.ts` give the presets, the sentences
  and tags of a maze, the varied pick of a batch and recipes read back from text. Decisions avoid `Math.pow`, `log`,
  `exp`, `atan2` and `hypot`, which engines round differently (`expOf`, `logOf`, `angleOf`).
- **`src/ui`** is the app:
  - `app.tsx`, the shell: the route from the hash (`routes.ts`, `navigation.ts`), the library (`library/use-library.ts`),
    the maze the route opens (`open-maze.ts`), the editing session, toasts and theme.
  - `studio/`: `Studio` puts the library grid on the page and the open maze on a canvas above it, with the flights
    between them (`use-studio-flight.ts`), the open board, the editor's islands and the quick list. Its state lives in
    one store per studio (`studio-store.ts`), which its hooks read by selector, and each render derives one
    `StudioScreen` from it: the library, a flight, a preview or the maze being edited.
  - `editor/`: the pure session (`edit-session.ts`), its hook (`use-maze-editor.ts`), the writer that copies and
    autosaves (`mine-writer.ts`), the wall and cell gestures, the keys, the tools, Checks, sharing and Rename.
  - `changes/`: the session's Changes (`session-changes.ts`, pure over one store per tab), Discard (`discard.ts`)
    and their chip and panel.
  - `library/`: the library's islands, grid and artboards, New maze, backup and updates.
  - `generator/`: the Generate dialog (beta) of New maze and of the editor's ⋯ menu, loaded on demand in its own
    chunk with the generator (`generate-dialog-loader.tsx`): the settings form (`settings-model.ts` without React,
    `settings-form.tsx`), the batch of 8 seeds in a row (`batch-run.ts`), which runs one maze per message (`job.ts`,
    with the targets it missed, `misses.ts`, streaming throttled snapshots of its progress) in a pool of workers
    (`generator-worker.ts`, a chunk of its own), what the dialog says about each maze (`candidates.ts`), and the
    canvas of a maze still loading on a card or a board (`loading-canvas.tsx`), which the studio's board loads from
    the dialog's chunk.
  - `board/`: `Board` (the SVG), `CameraStage` (the canvas with wheel, pinch, pan and the drawing gesture),
    `useCanvasCamera`, `Minimap`, `ThumbnailCanvas` and `paint-queue.ts`.
  - `embed/`: `Embed`, what `?embed` shows instead of the app, in its own chunk: the board of a repository or
    link route, still and fitted to the frame, its theme (`use-embed-theme.ts`, which takes the host page's
    `theme-message.ts` and tells it when it listens), and the link to the maze in the app (`embed-url.ts`).
  - `islands/`, `primitives/`, and `icons.tsx`, generated by `bun run icons`.

## Import rules

Checked by `bun run lint` through `no-restricted-imports` in `.oxlintrc.json`, and the rules themselves by
`tests/config/import-fences.test.ts`.

| Folder           | May import                                        | Never imports                                                 |
| ---------------- | ------------------------------------------------- | ------------------------------------------------------------- |
| `src/maze/`      | its own files, by relative path                   | anything else of the project, React, `node:` modules          |
| `src/library/`   | `src/maze`, its own files                         | `src/render`, `src/generator`, `src/ui`, React                |
| `src/render/`    | `src/maze`, its own files                         | `src/library`, `src/generator`, `src/ui`, React               |
| `src/generator/` | `src/maze`, its own files                         | `src/library`, `src/render`, `src/ui`, React, `node:` modules |
| `src/ui/`        | all of `src/` but `src/main.tsx`                  | any `@phosphor-icons/` package                                |
| `src/main.tsx`   | `src/maze`, `src/library`, `src/render`, `src/ui` | `src/generator`                                               |
| `scripts/`       | `src/maze`, `src/library`                         | `src/render`, `src/generator`, `src/ui`, tests, React         |
| any of `src/`    |                                                   | `tests/`, `scripts/`, `vendor/`                               |

## Tests

Four Vitest projects:

- `unit`: `tests/**/*.test.ts` in Node.
- `browser`: `tests/**/*.test.tsx` in Chromium through Playwright, components mounted alone or the whole app on a
  route (`tests/support/ui/library-app.tsx`); boards on their stage through `BoardHarness`.
- `performance`: `*-performance.test.ts(x)`, one file at a time, outside the check, against the frame budget of
  DESIGN.md 8 (`tests/support/ui/frames.ts`) at a CPU throttle calibrated to the machine (`throttle.ts`, `cpu-rate.ts`).
- `e2e`: `tests/e2e/`, which builds the app once under `/maze-studio/` into `node_modules/.tmp/`
  (`tests/support/e2e/serve-app.ts`) and drives it with Playwright; `production-frames.test.ts` is the frame gate on
  the built app, and `phone-flights.test.ts` flies on an emulated phone.

`bun run check` runs lint, format, typecheck, `unit`, `browser`, `e2e`, the build and the size report.
`tests/generator/generator.test.ts` holds the golden hashes, seed to walls per preset at the generator's version, which
a change of the walls never overwrites: it bumps the version and records new ones.
`tests/generator/mockup-cross-check.ts` is a tool outside the check that builds the same seeds with the generator's
mockup in the Micras workspace and compares the walls. `tests/maze/mazefiles-corpus.test.ts` reads every file of the
pinned mazefiles and checks invariants only. Real touches go through the DevTools protocol
(`tests/support/ui/touch.ts`). Reference screenshots live in `screenshots/` next to their test and are committed.
