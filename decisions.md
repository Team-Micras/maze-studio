# Decisions

The choices in force and why, by theme. A new dependency gets its reason here before it lands. How each choice was
reached, and the measurements of the day, are in the git history of this file.

## Dependencies

- **The monitor's stack, nothing more.** The dependencies are those of `micras-monitor` at the same exact versions,
  with the lockfile seeded from the monitor's. What only the monitor needs (`ws`, `uplot`) was left out.
- **`cmdk`** gives the quick list its listbox, the highlight the arrows move and the selection. It runs with
  `shouldFilter={false}`; the list filters with the library's own `SearchIndex`. About 4.4 KB gzip, on Radix's dialog,
  which the phone's sheet uses anyway.
- **Icons from `@phosphor-icons/core`, a devDependency.** `scripts/icons.ts` (`bun run icons`) writes the regular SVGs
  of the icons the app uses into `src/ui/icons.tsx`, one small component each, `aria-hidden` by default;
  `tests/config/icons.test.ts` keeps the file what the script writes. The React package shipped six weights per icon.
  The import fences refuse any `@phosphor-icons/` import in `src`.
- **No zip dependency.** `src/library/zip.ts` writes stored entries with CRC-32 and UTF-8 names, and reads deflated
  ones through `DecompressionStream('deflate-raw')`. A zip library would be the only runtime dependency for one button.
- **Primitives** are the monitor's shadcn copies with Phosphor icons; Toggle, ToggleGroup, Popover, Dialog, Input and
  Label come from shadcn's `new-york` source over the `radix-ui` package. Toasts are Radix `Toast` with a small zustand
  store; no `sonner`.

## The text format and the code

- **What fits the grid's shape is grid.** What the canonical text writes differently is an `Irregularity`, never a
  refusal; what breaks the shape is refused with line and column. A lone `\r` is a line break; a grid needs a cell line.
- **Walls by the middle character**, as upstream's `test_mazes.py` reads them: an east–west segment is a wall when its
  middle is `-`; anything but `---` or three spaces is a `wall` irregularity. A post column is a wall only for `|`.
- **One start.** The first `S` in reading order is the start; every later one is an `extra-start`, its cell unmarked.
- **`short-line`** (a cell line shorter than the first, followed by posts) reads as padded with spaces;
  **`ragged-line`** reports a line after the grid that looks like more of it; **`long-trailer`** is a trailer over
  65,535 bytes of UTF-8. Two mazes in one file read as one, with the irregularities reported, never silently.
- **One code per maze.** The decoder refuses non-zero padding bits and keeps a byte order mark of the trailer or the
  name (`ignoreBOM: true`), so both round-trip byte for byte. The code never carries the text after the grid.

## Validation

- **Findings point at cells, edges and posts**, and a rule that fails in many places gives one finding listing them
  all. Grid irregularities give one finding each, with their line and column.
- **"Homogeneous grid"** covers `wall`, `cell`, `short-line` and `ragged-line`; `extra-start` belongs to "single start",
  which counts every `S` upstream's `read_maze` might read; `long-trailer` is its own warning, `trailer-size`.
- **Rules of the file read `source`** and stop applying once the maze is edited. The start cell's north side must be
  open only when the maze is more than one cell tall. "Single goal entrance" warns when the count is not one.
- **No `error` in the repository** under its folder's profile, checked by the corpus test at every pinned commit.

## Library data and storage

- **The snapshot follows the submodule.** `src/library/snapshot.json` is generated from `vendor/mazefiles` by the `pre`
  scripts and never committed; it is written one file per line and not formatted by oxfmt. Dependabot bumps the
  submodule weekly and `mazefiles-auto-merge.yml` merges a bump that changes only `vendor/mazefiles` once the required
  checks pass. It runs on `pull_request_target`, so a pull request cannot change what runs with write access, and waits
  for the required checks, so an unprotected `main` never merges a bump untested. `pages.yml` also runs every Monday
  at 12:00 UTC, since a merge made with `GITHUB_TOKEN` starts no workflow.
- **Corpus tests check invariants**, never the counts of one commit: blob SHA, byte-for-byte and code round trips, no
  irregularity, no `error`, the snapshot equal to the submodule, and a floor of 500 files.
- **Updates.** The snapshot wins over an older cached copy. A failed check counts as the day's check. An update stops
  starting downloads at its first failure. The automatic check runs once a day and only in production builds; the e2e
  build turns it off (`VITE_AUTO_UPDATES=off`).
- **My mazes** (`mine` in code) keeps a version per item; a save names the version it was made from and is refused
  over a newer one or a removed item. Every write is announced on a `BroadcastChannel` to the other tabs, and the
  first asks for `navigator.storage.persist()`. Its category in the catalog is its profile. The channel does not reach
  the tab that writes, so that tab reloads its library through `reloadLibrary` after each copy and save.
- **Search** finds an entry by tokens that each start a word of its name, competition, year or size. The name splits
  at punctuation and between letters and digits (`japan2011hef` gives `japan`, `2011`, `hef`). A square size has three
  spellings (`16`, `16x16`, `16×16`); any other only both sides (`10x5`, `10×5`), so `5` does not find every 10×5.
- **Zip limits.** An entry over 1 MiB, an archive over 32 MiB, overlapping entries and an entry that inflates past or
  short of its size are refused. Each entry inflates 1 KiB of input at a time into a buffer of the declared size, so a
  bomb is refused in milliseconds instead of inflating whole. Import refuses an oversized file before reading it.
- **The backup keeps an index** (`maze-studio-backup.json`) with what a `.txt` cannot hold: the name as typed, the
  profile, the creation time, the origin. Export says which items it left out and why. Import names each maze
  uniquely in My mazes (a clash becomes "<name> 2"), reports what it added, renamed and skipped, and turns the library
  to My mazes when it added anything. Imported mazes are not session Changes: nothing was edited.
- **The folder's handle is kept only where storage is persistent.** A private window never reads a handle back.
  Playwright's off-the-record contexts crash on reload over the origin's private file system the tests use, so the
  folder's e2e tests run in a persistent context.

## Drawing

- **The track's colours are values** (`TRACK_COLORS`), the same in both themes, since canvas thumbnails cannot read CSS
  variables. The UI's colours, shadows and easing curves (`--ease`, `--ease-out`, `--ease-drawer`) are tokens in
  `src/ui/styles.css`; `src/render/easing.ts` holds the same curves as numbers for the camera.
- **Thumbnails are keyed by the caller** (a string, such as the compact code, plus the band). A thumbnail with a diff
  is `diffThumbnail`, keyed by the diff too. Walls and posts are at least 1 device pixel and the outer ones end inside
  the bitmap, in every band.
- **Thumbnails paint in idle time** (`paint-queue.ts`), in idle periods with at least 8 ms left; without
  `requestIdleCallback` a turn every 16 ms paints exactly one. A cached bitmap shows at once; until a paint the canvas
  keeps its previous bitmap, scaled, or its floor colour.
- **Live mazes are painted, not cached.** The minimap paints the maze being edited straight onto its canvas.
- **Artboards carry a crisp shadow**, a hairline ring and a 2 px drop: the slab's blurred shadow on every mounted
  artboard broke the frame budget. The editor's board keeps the slab, which scales with the camera.

## The studio

- **The library is a grid the browser scrolls**, in an element that fills the screen (`data-library-scroller`, with
  `overscroll-behavior-y: contain` against pull-to-refresh). Its columns follow that element's width and only the rows
  on screen and one more above and below are mounted, plus the artboard with the focus. Hiding the document's own
  scrollbar while a maze is open left headless Chromium without a frame, hence the scroller.
- **The open maze is a canvas fixed above the grid**, under one camera (`useCanvasCamera`, `boardLimits`). The camera
  follows the fit until the user moves it; fitting with `0` returns to following it. Its actions are stable, so a
  component that only moves the camera does not re-render with it.
- **Only the board flies.** Opening an artboard flies the board 620 ms from its thumbnail to the editor's fit; leaving
  flies 520 ms back onto the thumbnail after the hidden grid scrolls it into view. The grid fades out and in around
  it; nothing in it scales. A maze without an artboard (a link, a file, a new maze), reduced motion and a fresh load
  arrive and leave without a flight. The flight back starts from where the board was on screen, and a jump cancels a
  flight in still on its way; the flight in lands in the editor only while a maze is still open.
- **A flight's first frame stays light.** A press on an artboard mounts its board hidden and the click only shows it;
  the editor's chrome, checks, menu, tools and minimap mount after landing, in deferred renders. The clock starts two
  frames after the call; the world layer has `will-change: transform` only while it flies.
- **An artboard's route is pushed at once**, so with reduced motion the editor is there in the next frame. A tap opens
  from its lift, even after a long press; a held finger opens no menu and selects nothing; the click that follows a
  touch that opened a maze is ignored for 400 ms. The stage lets taps through while the board flies back.
- **The quick list previews in place** without a flight and without moving the URL; it changes nothing on hover; Enter
  or a click pins by replacing the route, Esc puts back the pinned one. Its rows are memoised. On a phone the sheet
  focuses the list rather than the filter, so the keyboard does not cover it.
- **View mode.** A maze opened on a phone, or by a touch, is open to look at; the Edit button leaves it.

## Routes and history

- **Anything the hash does not name is the library** with the default filter; a filter writes only the keys that
  differ from the default and replaces the history entry. A maze the library lacks, or a link that does not decode,
  opens the library with a toast. A `.txt` file or a new maze opens without a route of its own and is dropped once
  the hash moves elsewhere.
- **Library goes back only to a library below.** Each history entry the app makes says whether the library's lies
  below it (`history.state.libraryBelow`); Library goes back then, so the filter comes back, and pushes the library
  otherwise. The first edit of a maze without a route pushes `#/mine/<uuid>`.
- **Leaving a maze of My mazes changed in the session** turns the library to My mazes and lands on its artboard.

## Editing

- **The session lives in `App`.** The first edit of a maze outside My mazes copies it there and moves the route to
  `#/mine/<uuid>` before the library has loaded the copy; the session answers for that route meanwhile. The copy is
  `uniqueName("<name> (edited)")` with the original's text after the grid, profile and, from the repository, path and
  blob SHA; undoing every step saves it back byte for byte. A new maze keeps its own name, renamed in memory before its
  first edit if asked.
- **Autosave** after every gesture, one write at a time, the latest state of each maze winning, a session per maze;
  one copy per maze, which a second Save to My mazes waits for. The writer saves on the larger of the version it last
  saved and the session's. A save refused because another tab saved since turns the maze read-only. Reload into a new
  version waits for the writes on their way (`pending-writes.ts`).
- **The stage arbitrates the pointer.** The primary button or one finger draws unless it pans (Hand, view mode, Space,
  the middle button); a second finger takes the drawing back and pinches. A finger previews the slot it pressed and
  changes it only on release or once the stroke steps on. A touch edits at any zoom (owner, 14/10): a tap that does
  nothing reads as broken, and who wants precision zooms in.
- **The cell tools apply on release**, as one step; with the keyboard, a first Enter marks a corner and a second
  applies. Arrows move the cell cursor, Shift and an arrow toggle that side's wall.
- **Checks** validate the maze on screen with the session's profile, which is part of the session but not of undo, and
  with the file's source until the first edit.
- **Changes** live in one in-memory store per tab, fed by the writer: a copy or new maze from its first write, a maze
  of My mazes from its first save, against the state the session first opened. Discard, armed for 3 s, deletes a copy
  or saves back the first state; Keep takes the item out. An item back at its baseline, maze and profile (`differs`), is
  neither listed nor counted (owner, 14/10), nor turns the library to My mazes on leaving; nothing is deleted on its
  own. Save to My mazes of a link or `.txt` not edited is no change
  (owner, 14/10): the copy is noted as a maze of My mazes from before the session, its saved state the baseline, so it
  enters Changes only at a later save and Discard saves that state back.
- **The title opens Rename** (owner, 14/10), the dialog of the ⋯ menu, for a maze of My mazes and a new maze: an inline
  field had no confirm button on a phone. Dialogs close without an exit animation, as menus do, so their
  backdrop never swallows the next tap. "Show changes" shows its `D` only on a fine pointer outside the phone layout.
- **Save to My mazes is in the ⋯ menu** (owner, 14/10), so the title keeps the island's width on a phone; it is not
  offered while editing on a phone, since the first edit saves anyway. A mouse has no view mode, so a notebook keeps it.

## Sharing and files

- **Copy link** puts `#/m/<code>` on the clipboard, falling back to `execCommand('copy')` and then the address bar; a
  toast says when the text after the grid is left out. Share… uses Web Share where the browser has it.
- **Save to folder** rereads the file first and asks before writing over a change on disk. Reading the folder skips a
  file that cannot be read or is over 1 MiB, and counts it. Opened `.txt` files are refused over 1 MiB.
- **Several mazes of My mazes are deleted by selecting** (owner, 14/10): a press held 500 ms starts it, only on My
  mazes; the bar's Delete goes through the same delete as the ⋯ menu's, for a list of ids.
- **Rename** refuses a name already in My mazes, without case. Menus close without an exit animation, and downloads
  and Share… start once the menu has closed, so nothing eats the next click.
- **Toasts** last 2.4 s, and 8 s when they carry an action, so its button can be reached; Radix pauses them on hover
  and focus. The new version's toast stays until Reload or its close button.

## The embed

- **A separate entry, loaded on demand.** `src/main.tsx` reads `?embed` and imports either `App` or `Embed`, each in
  its own chunk, so a page that frames one maze downloads neither the editor, Radix, the library's screens nor
  IndexedDB: about half the app's first screen (`bun run size` prints both). The snapshot, which the app loads too,
  comes on top only for a repository route. The cost is one more round trip before the app's chunk, which
  index.html no longer preloads; the service worker hides it after the first visit. The embed registers no service
  worker, which would install the whole app in a visitor's browser for one picture, and so offers no new version
  either. Browsers keep service workers apart by top-level site, so a frame on another site never meets the
  visitor's installed app and always loads the current build; only a visitor who opens `?embed` directly, or frames
  it from the same site, gets the index.html of an older installed app, the whole app, until it takes its update.
  A chunk that fails to load leaves a sentence on the page rather than a blank one.
- **The embed's imports skip `@/library`'s index.** The bundler puts every module both entries reach into one
  shared chunk, and the index reaches My mazes, the repository cache, the GitHub updater and the backup, about 7 KB
  gzip the embed would download and never run. So the embed imports `@/library/catalog` and `@/library/snapshot`,
  and `open-maze.ts`, which it shares with the app, takes `keyOf` from `@/library/maze-key` and only types from the
  index.
- **A still board, with no input.** The embed draws `Board` fitted to the frame, with no camera and no listener, so
  the wheel and a finger over it scroll the host page. The host sizes the frame, and the link opens the maze in the
  app for a closer look. The board is `role="img"`, named as its artboard is: name, competition when the name tells
  it, and size.
- **Only the repository and links.** My mazes and the folder live in the visitor's own browser, so a page of
  another site naming one would show whatever that visitor keeps, or nothing; the embed refuses them, and the
  library, with a sentence. A repository maze comes from the built-in snapshot, never from GitHub.
- **The theme follows the host.** `?theme=` forces one as in the app; without it the embed follows
  `prefers-color-scheme` as it changes. A host posts `{ type: 'maze-studio:theme', theme }` to change it without a
  reload, which wins over both from then on. Only a message whose `source` is `window.parent`, of that `type` and
  with `theme` `light` or `dark`, counts: any page can post to a frame, and only the one that holds it should steer
  it. Other keys are ignored, so a later version can add some. The message changes nothing but the theme.
- **The embed says when it listens.** Its listener comes with its chunk, after the frame's `load`, so a theme
  posted on `load` could arrive before it. Once listening, the embed posts `{ type: 'maze-studio:ready' }` to its
  parent with the target `*`: the message carries nothing, and the embed cannot know the host's origin.

## Accessibility and layout

- **The canvas is `role="application"`**, focusable, with its keys and pointers; `camera-stage.tsx` has the lint
  overrides that role needs. Quiet zoom: the percentage is plain text. Live regions that must speak stay mounted (empty
  library, read-only, Checks).
- **axe fails on every impact**, minor ones included, and runs after `settled()`, two quiet frames.
- **Safe areas.** Fixed islands and toasts sit off the notch through the `*-safe-*` utilities;
  `tests/config/safe-areas.test.ts` fails a fixed element by an edge without one. The grid's insets do not add them.
- **"Mine" reads "My mazes"** everywhere the user reads it; code names stay `mine`.
- **English only**: counts stay as written, without `Intl.NumberFormat`. Names, paths and commits shown are
  `translate="no"`.

## Tests and performance

- **Four Vitest projects**: `unit` (Node), `browser` (Chromium), `performance` (outside the check, one file at a time)
  and `e2e` (the app built once under `/maze-studio/` into `node_modules/.tmp/`, never `/tmp`).
- **The frame budget of DESIGN.md 8**: p95 at most 20 ms and at most 1 % of frames over 25 ms, the median of three runs
  by share of slow frames, then worst frame, then p95. The production gate in `e2e` holds it on the built app. The
  library's gate in `performance`, on React's development build in the tester's iframe, allows 2 %: it spreads from 0
  to 1.5 % between runs on the reference notebook. The flights also allow no frame over 33 ms. A flight lasts about 45
  intervals, so one slow frame is 2.2 % of a run, and the median run failed the gate whenever two of the three runs had
  one. The production gate pools the intervals of its three runs (about 135) for the p95 and the 1 %, rounded up to
  whole frames (2 slow frames in 135). The 33 ms ceiling stays on the median run: over all three runs a frame of 33.3
  ms, two refreshes at 60 Hz, shows up in most measurements.
- **Throttling is calibrated to the machine**: a fixed workload is timed unthrottled and the throttle is
  `clamp(4 × 27 ms / measured, 1, 4)`, 27 ms being the reference notebook (i5-12500H).
- **Reference screenshots are committed** next to their test, made in `mcr.microsoft.com/playwright:v1.63.0`; the
  browser context has the tests' 1440 × 900 viewport so the tester iframe runs at scale 1.
- **Touches are real**: synthetic touches cannot be captured, so pinch and tap tests send them through the DevTools
  protocol (`tests/support/ui/touch.ts`).
- **Diff fixtures come from known edits**, their counts written by hand, never from `diffMazes`.
- **The 250 KB budget is reported only**: `bun run size` prints the first screen's size, the app's and the embed's,
  and fails only when it cannot find the chunk of one of them, never over the budget.
- **Lint rules are relaxed only where a file needs it**, each override naming its files: `mine.ts`
  (`BroadcastChannel.postMessage` takes no origin), `thumbnails.ts` (`fill(path)` is not an array fill),
  `camera-stage.tsx` (the application role), and `no-await-in-loop` for `scripts/`, the e2e tests and the frame and
  touch helpers, which wait step by step on purpose.
