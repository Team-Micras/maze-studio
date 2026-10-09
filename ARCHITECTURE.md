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
