# maze-studio

A web app for the micromouse community to browse, view, edit and share mazes in the text format of
[micromouseonline/mazefiles](https://github.com/micromouseonline/mazefiles). It is a PWA: it runs in
the browser on a laptop or a phone, installs, and works offline at a competition.

It is under construction. The plan is a library of every maze of the mazefiles repository with
search and thumbnails, a viewer that draws the maze like the real track, a fast editor with undo and
validation, and sharing as a `.txt` file or a link.

## Credit

The mazes come from [micromouseonline/mazefiles](https://github.com/micromouseonline/mazefiles),
a collection of micromouse maze files gathered over many years from many sources by micromouseonline
and its contributors. maze-studio pins it as the submodule `vendor/mazefiles` and builds its library
from that commit. Corrections to a maze belong upstream, as an issue on that repository.

## Requirements

- [Bun](https://bun.sh) 1.4 (package manager and scripts)
- Node.js 22.12 or later (Vite and Vitest run on it)
- Playwright's Chromium for the browser tests: `bunx playwright install chromium`

## Running it

```sh
git clone --recurse-submodules <this repository>
bun install
bun run dev
```

In a clone made without `--recurse-submodules`, run `git submodule update --init` once.

| Script             | What it does                                                          |
| ------------------ | --------------------------------------------------------------------- |
| `bun run dev`      | Development server                                                    |
| `bun run build`    | Typecheck and build into `dist/`; `BASE_PATH=/maze-studio/` for Pages |
| `bun run preview`  | Serve the built app                                                   |
| `bun run test`     | Unit tests (Node) and browser tests (Chromium)                        |
| `bun run test:e2e` | Builds the app and checks the PWA in Chromium                         |
| `bun run size`     | Gzip size of the build, after `bun run build`                         |
| `bun run check`    | Lint, format, typecheck, tests, e2e, build and size: what CI runs     |

To understand the code, start with [`ARCHITECTURE.md`](ARCHITECTURE.md).

## License

The code is under the [MIT license](LICENSE). The mazes belong to the mazefiles repository and its
contributors.
