# maze-studio

A web app for the micromouse community to browse, view, edit and share mazes in the text format of
[micromouseonline/mazefiles](https://github.com/micromouseonline/mazefiles). It is a PWA: it runs in
the browser on a laptop or a phone, installs, and works offline at a competition.

## What it does

- **Library.** Every maze of the mazefiles repository on one canvas, with thumbnails, search, and
  filters by source (Repo, My mazes, and a local Folder where the browser can open one) and category.
  Pan with a drag, zoom with the wheel, a pinch or `+`/`-`.
- **Viewer.** Opening a maze flies into it and draws it like the real track: walls, posts, start and
  goal, with checks against the classic rules ("Passes", or what is wrong and where).
- **Editor.** Walls by drag or click, rectangles, clear area, start and goal, with undo and redo,
  a cell cursor on the keyboard, and New maze in the classic, half-size and training sizes or a
  custom one. The first edit of a repository maze makes a copy in **My mazes**, kept in the browser and
  saved as you go; the Changes chip lists what changed in the session, to discard or keep.
- **Sharing and files.** Copy link (the maze in the URL), Share… on a phone, Download .txt, Open a
  `.txt`, Save to folder, and Export all and Import of My mazes as a zip.
- **Offline and installable.** After the first visit the app opens, searches, edits and saves with
  no network; it installs as an app, says "New version." with Reload when there is one, and checks
  GitHub for newer mazes once a day and on Check for updates.

Service worker, installation and Open folder need a secure context: `https://` or `localhost`.

## Embedding

Another site can show one maze in a frame: the maze alone, fitted to the frame, with a small link
that opens it in maze-studio. The frame takes no wheel or touch, so the page around it scrolls as
usual.

```html
<iframe
  src="https://maze.micras.team/?embed#/repo/classic/br2025-robochallenge-day1.txt"
  title="Maze of RoboChallenge Brasil 2025, day 1"
  loading="lazy"
  style="width: 100%; aspect-ratio: 4 / 3; border: 0"
></iframe>
```

- `embed` in the query turns the embed on; its value does not matter. Inside any frame maze-studio
  is always the embed, with or without it, so a frame made without `?embed` still works and no site
  can frame the editor itself.
- `theme=light` or `theme=dark` sets the theme. Without it the frame follows the visitor's system
  theme, also when it changes.
- The hash picks the maze: `#/repo/<path>` for a maze of the repository, as maze-studio has it
  built in, or `#/m/<code>` for a link made by Copy link. My mazes and an opened folder live in the
  visitor's own browser, so the embed does not show them, and says so.

The page around the frame can set its theme without reloading it, for example when the page has a
theme switch of its own. The frame posts `{ type: 'maze-studio:ready' }` to the page once it
listens; send the theme on `maze-studio:ready` and whenever it changes:

```js
const frame = document.querySelector('iframe');
const sendTheme = (theme) =>
  frame.contentWindow.postMessage({ type: 'maze-studio:theme', theme }, 'https://maze.micras.team');
window.addEventListener('message', (event) => {
  if (event.source === frame.contentWindow && event.data?.type === 'maze-studio:ready') {
    sendTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }
});
```

The frame takes the theme message only from the page that holds it, with `theme` either `light` or
`dark`. Once it has one, it no longer follows the system theme.

For a frame with a `sandbox` attribute, use
`sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"`; the two
popup flags let "Open in maze-studio" open.

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
| `bun run build`            | Typecheck and build into `dist/`; `BASE_PATH` sets a base other than `/`   |
| `bun run preview`          | Serve the built app                                                        |
| `bun run test`             | Unit tests (Node) and browser tests (Chromium)                             |
| `bun run test:performance` | Frame-time tests in Chromium, one file at a time, outside the check        |
| `bun run test:e2e`         | Builds the app and drives it in Chromium: PWA, offline, library, editor    |
| `bun run size`             | Gzip size of the build, after `bun run build`                              |
| `bun run snapshot`         | Write `src/library/snapshot.json` from `vendor/mazefiles`; runs on its own |
| `bun run check`            | Lint, format, typecheck, tests, e2e, build and size: what CI runs          |

`src/library/snapshot.json` is generated, not committed: `dev`, `build`, `lint`, `typecheck` and
the test scripts write it from the submodule first, when it is missing or of another commit.

## Keeping the mazes up to date

Dependabot (`.github/dependabot.yml`) opens two pull requests every week that move
`vendor/mazefiles` to the newest commit of `master`: one against `main`, so new mazes reach the site
without a release, and the same one against `develop`. The workflow `mazefiles-auto-merge.yml` turns on auto-merge for a
pull request of Dependabot's that changes nothing but the submodule, so it lands once CI passes,
with no one involved. For that, the GitHub repository needs:

- **Allow auto-merge**, in Settings, General, Pull Requests;
- a rule for `main` and one for `develop` (branch protection or a ruleset) that require the
  `check` job of CI to pass before merging.

The workflow also waits for those required checks itself and fails, merging nothing, when the base
branch requires none. Without auto-merge, the pull request waits for a person. A merge made with
the workflow's `GITHUB_TOKEN` starts no other workflow, so once a bump is merged on `main` the
workflow starts `pages.yml` itself, by `workflow_dispatch`.

The two bumps never get in the way of a release: a merge compares content, and the same gitlink on
both sides is no conflict. The one case is `develop` a bump behind `main`, when one of the two pull
requests failed; the release then conflicts on `vendor/mazefiles`, and the newer commit is the one
to keep.

`pages.yml` publishes `main` to <https://maze.micras.team> on every push to it and on demand from
the Actions tab.

To understand the code, start with [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Contributing

The repository follows gitflow. Start a `feature/<name>` branch from `develop` and open a pull
request back to `develop`; `bun run check` must pass, and CI runs it on every pull request. A
release is a pull request from `develop` to `main`, which publishes the site; a `hotfix/<name>`
starts from `main`.

Every pull request from a branch of this repository gets a preview at
`https://pr-<number>.maze-studio-8ol.pages.dev/`, linked in a comment and updated on every push. A
pull request from a fork gets CI but no preview: a preview publishes its code under the project's
domain. The site and the previews are deployments of one Cloudflare Pages project, `maze-studio`:
`main` is production, at `maze.micras.team`, and each pull request a branch `pr-<number>`.
`preview-build.yml` builds the pull request with no write access and no secret, and
`preview-deploy.yml`, which runs as it is on the default branch, uploads the built files and never
runs them. Each preview is an origin of its own, so it keeps its own My mazes and service worker,
and nothing of the site's.

### Set up

- **Cloudflare**, once: a Pages project `maze-studio` with production branch `main` and the custom
  domain `maze.micras.team`, and a token with only Account, Cloudflare Pages, Edit, saved as the
  repository secret `CLOUDFLARE_API_TOKEN`. The account id is in the deploy workflows.
- **Rules** for `main` and `develop` that require the `check` job of CI.
- **Allow auto-merge**, for the weekly mazefiles bumps.

## License

The code is under the [MIT license](LICENSE). The mazes belong to the mazefiles repository and its
contributors.
