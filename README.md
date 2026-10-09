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
and its contributors. maze-studio pins it as the submodule `vendor/mazefiles` and builds its library from the commit
pinned, which Dependabot moves forward every week; `git submodule status vendor/mazefiles` prints
it. Corrections to a maze belong upstream, as an issue on that repository.

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

| Script                     | What it does                                                               |
| -------------------------- | -------------------------------------------------------------------------- |
| `bun run dev`              | Development server                                                         |
| `bun run build`            | Typecheck and build into `dist/`; `BASE_PATH=/maze-studio/` for Pages      |
| `bun run preview`          | Serve the built app                                                        |
| `bun run test`             | Unit tests (Node) and browser tests (Chromium)                             |
| `bun run test:performance` | Frame-time tests in Chromium, one file at a time, outside the check        |
| `bun run test:e2e`         | Builds the app and checks the PWA and the library in Chromium              |
| `bun run size`             | Gzip size of the build, after `bun run build`                              |
| `bun run snapshot`         | Write `src/library/snapshot.json` from `vendor/mazefiles`; runs on its own |
| `bun run check`            | Lint, format, typecheck, tests, e2e, build and size: what CI runs          |

`src/library/snapshot.json` is generated, not committed: `dev`, `build`, `lint`, `typecheck` and
the test scripts write it from the submodule first, when it is missing or of another commit.

## Keeping the mazes up to date

Dependabot (`.github/dependabot.yml`) opens a pull request every week that moves `vendor/mazefiles`
to the newest commit of `master`. The workflow `mazefiles-auto-merge.yml` turns on auto-merge for a
pull request of Dependabot's that changes nothing but the submodule, so it lands once CI passes,
with no one involved. For that, the GitHub repository needs:

- **Allow auto-merge**, in Settings, General, Pull Requests;
- a rule for `main` (branch protection or a ruleset) that requires the `check` job of CI to pass
  before merging.

Without the rule nothing makes the merge wait for CI; without auto-merge, the pull request waits
for a person.

To understand the code, start with [`ARCHITECTURE.md`](ARCHITECTURE.md).

## License

The code is under the [MIT license](LICENSE). The mazes belong to the mazefiles repository and its
contributors.
