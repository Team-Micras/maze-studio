# Decisions

Dependencies and other choices that need their reason written down. A new dependency gets an entry
here before it lands.

## 08/10/2026 — Slice 0: the monitor's stack, nothing more

The dependencies are those of `micras-monitor`, at the same exact versions, with the lockfile seeded
from the monitor's so the transitive versions match too. What only the monitor needs was left out:
`ws` and `@types/ws` (its WebSocket bridge), `uplot` (its plots) and `cmdk` (its launcher). Nothing
was added.

## 08/10/2026 — Slice 0: the e2e build lives in `node_modules/.tmp/`

The machine's rule is no builds in `/tmp`, so `tests/e2e/pwa.test.ts` builds the app under
`/maze-studio/`, the GitHub Pages base path, into `node_modules/.tmp/` and removes it afterwards.

## 08/10/2026 — Slice 1a: how the text format reads what the canonical text does not write

- **Wall by the middle character.** An east–west segment is a wall when its middle character is
  `-`, as `find_cell_walls` of the repository's `test_mazes.py` reads it: `-  ` and `  -` are no
  wall, `-` and `-- ` are. Any segment other than `---` or three spaces is a `wall`
  irregularity. A post column of a cell line is a wall only for `|`.
- **Several `S`.** The model holds one start, so the first `S` in reading order (north to south,
  west to east) is the start and every later one is an `extra-start` irregularity, its cell left
  unmarked. Note for slice 1c: the upstream test counts `S` anywhere in the grid, so the rule "at
  most one `S`" must count the `extra-start` irregularities and also an `S` outside a mark column,
  which reads as a `cell` or `wall` irregularity whose `found` holds it.
- **`short-line`.** A cell line shorter than the first line, which is what an editor that strips
  trailing spaces leaves of a maze with an open east border, is part of the grid when a line of
  posts follows it, and reads as if padded with spaces. Without that line of posts it is not, so a
  trailer line starting with a space stays in the trailer.
- **`ragged-line`.** The line right after the grid looks like more of it but breaks its shape, so
  the grid may have ended early: it starts with `o` or `|`, as the upstream `read_maze` would take
  for the grid; or it starts with a space, as a cell line with an open west border does, and
  either holds only grid characters (spaces, `|`, `S`, `G`) with at least one that is not a space,
  or comes before a line that starts like a line of posts (`o---o` or `o   o`). A line of spaces
  alone, or a note before a line of text, is not reported: they are common in notes and say
  nothing about a cut grid. A file cut right after such a line is reported too.
- **`long-trailer`.** The trailer has more than 65,535 bytes of UTF-8, counted in bytes, not
  characters. Note for slice 1c: it is a warning of its own, not part of "homogeneous grid"; and
  the check before sharing looks at the trailer itself, since the code cannot carry it.
- **A grid needs a cell line.** A line of posts alone is refused at line 2, since a maze has at
  least one cell.
- **A lone `\r` is a line break.** `\r\n` and a lone `\r` both become `\n`, and `hadCR` says so.
- **`ignoreBOM: true`.** The code's decoder keeps a leading byte order mark of the trailer or the
  name, so both come back byte for byte.
- **The remaining ambiguity.** What fits the grid's shape is grid, whatever the file meant. A
  trailer line as long as the grid's lines that starts with a space or `|` and is followed by a
  line of posts of that length reads as more grid; so does a short or empty line followed by such
  a line of posts, since a short cell line is accepted. Two 2×2 mazes in one file separated by a
  blank line read as one 2×5 maze, with the blank line as a `short-line` and the second `S` as an
  `extra-start`: reported, never silent. The repository has no trailer but a blank line at the end.
- **Padding bits.** The code's decoder refuses a last wall byte whose padding bits are not zero
  (`non-canonical`), so each maze has one code.

## 08/10/2026 — Slice 1c: validation

- **Findings point at posts too.** Besides cells and edges, a `Finding` lists `posts`, the
  corners `(0..width, 0..height)`, since a loose post is neither a cell nor an edge.
- **One finding per problem, not per place.** A rule that fails in many places (loose posts,
  border openings, goal entrances) gives one finding listing them all, so an empty 32×32 maze has
  one loose-post finding, not a thousand. Grid irregularities give one finding each, since each
  has its own line and column.
- **"Homogeneous grid"** covers the `wall`, `cell`, `short-line` and `ragged-line`
  irregularities. `extra-start` belongs to "single start" and `long-trailer` to its own rule,
  `trailer-size`, a warning under every profile.
- **Counting `S`.** "Single start" counts the start, every `extra-start`, an `S` beside a cell's
  mark, an `S` in a wall position, and an `S` in a `ragged-line`, which the upstream `read_maze`
  may read as grid; one in a post column of a cell line points at the cell east of it (west of it
  on the east border), and one in a ragged line points at nothing.
- **Where a finding points.** A `short-line` points at the whole row and its east edge, where the
  text went missing; a misplaced classic goal points at the four cells it should be and at the
  goal cells that are elsewhere.
- **The start cell's north side** must be open only when the maze is more than one cell tall; in a
  1-cell-tall maze it is the border.
- **Goal entrances.** "Single goal entrance" warns when the count is not one, so a sealed goal
  area is reported too; at the pinned commit no file has zero, and 54 have more than one.
- **Parity at `548dcde`.** No `error` in any of the 581 files under its folder's profile; the proof
  rules fire on 100 files (loose post), 2 (unreachable goal) and 54 (more than one entrance), the
  numbers the plan's reviewer measured.

## 08/10/2026 — Slice 2: library data

- **No zip dependency.** `src/library/zip.ts` writes zips with stored (uncompressed) entries,
  CRC-32 and UTF-8 names, about 200 lines: maze text is small, and a library such as fflate or
  JSZip would be the only runtime dependency for one button. Its reader also takes deflated
  entries through the platform's `DecompressionStream('deflate-raw')`, so a zip of `.txt` files
  made by another tool imports too. Python's `zipfile` reads our archives (`testzip` clean); the
  deflated fixture in `tests/support/library/` was made with it.
- **The backup keeps an index.** Next to the `.txt` files, `maze-studio-backup.json` keeps what a
  `.txt` cannot (the name as typed, the profile, the creation time, the origin). Without it, as for
  loose `.txt` files, an import names a maze after its file and gives it the `free` profile.
- **`snapshot.json` is not formatted by oxfmt.** The script writes one file per line, so a new
  commit of mazefiles shows as a readable diff; the formatter would make it ten lines per file.
- **The snapshot wins over an older cached copy.** The cache remembers which built-in snapshot
  it replaced; when the app ships a new one, the cached copy is dropped and the next check brings
  it up to date again, so an app update never shows mazes older than its own snapshot.
- **A failed check counts as the day's check.** It records the time and the reason, so an
  offline phone does not hammer GitHub on every visit; the update button always checks.
- **`unicorn/require-post-message-target-origin` is off for `src/library/mine.ts`.** The rule is
  about `window.postMessage`; `BroadcastChannel.postMessage` takes no target origin.
- **A folder handle round trip needs a persistent browser context.** Reading a
  `FileSystemDirectoryHandle` back out of IndexedDB crashes the page in Chromium 1243 under
  Playwright's default off-the-record contexts, headless shell and full build alike; in a
  persistent context it works (checked by hand). `Settings` is generic over what it keeps as the
  folder, so its own logic is tested with a plain stand-in. Slice 6, whose local-folder test keeps
  an OPFS handle in IndexedDB, needs a persistent context, and should check whether Chrome's
  incognito windows have the same crash.
- **Mine's category in the catalog is its profile**, the closest to a repository folder.
- **Zip limits.** The reader refuses an entry that declares more than 1 MiB (a 16×16 maze is
  about 1 kB, a 64×64 under 40 kB), an archive that declares more than 32 MiB in all, entries
  whose data overlap, and an entry that inflates past or short of the size it declares. It
  inflates one entry at a time, into a buffer of the declared size, and feeds the decompressor 1
  KiB of deflated data at a time, reading its output between writes, so each step makes at most
  about 1 MiB (deflate expands at most about 1032 times) and the stream is cancelled right past
  the cap. Handing it the whole entry at once, as a `Blob.stream()` does, lets Chromium inflate
  everything before the first read: a 1 GiB bomb took 383 ms and a gibibyte of memory; it is now
  refused in about 2 ms. `tests/library/zip-bomb.test.tsx` checks that in Chromium, with a bomb
  that a browser command deflates on the Node side.
- **The export says what it left out.** `exportMine` returns `{ zip, skipped }`: an item whose
  stored code does not read cannot be written as a `.txt`, so the screen must tell the user which
  ones were left out rather than drop them silently.
- **An update stops at its first failure.** Downloads already running finish; no new one starts.

## 09/10/2026 — Slice 3: drawing and camera

- **Phosphor replaces Lucide.** `@phosphor-icons/react` 2.1.10 (exact, its latest) is the icon set
  of the approved Studio direction (DESIGN.md D3 and 4): the owner chose the directions drawn with
  it, and it moves the app away from the default shadcn look. `lucide-react` left `package.json`
  and `components.json` names `phosphor`; no file imported Lucide yet. Icons are always imported by
  name. Effect on `bun run size`, measured by importing icons into the app and building: nothing
  until an icon is used (72.6 KB eager, as before); one icon adds 1.3 KB gzip and twelve add
  8.8 KB, about 0.7 KB each past the first, since each Phosphor icon carries its six weights. The
  forty icons of DESIGN.md 4 should stay near 30 KB, well inside the 250 KB target.
- **The track's colours are values, not theme tokens.** The track looks the same in both themes,
  so `TRACK_COLORS` in `src/render/track-colors.ts` is the one source for the SVG board and the
  canvas thumbnails, which cannot read CSS variables. The UI tokens of DESIGN.md 2.1 (desk,
  islands, ink, the added `--warning`, `--success` and `--diff-ink`, and the island and slab
  shadows) replaced the shadcn defaults in `src/ui/styles.css`.
- **The board slab's shadow scales with the camera.** It sits on the SVG in world units, as in the
  approved mockup. Measured on a 32×32 board, wheel zoom up to about seven times the fit and a
  drag at about four times keep p95 at 16.8 ms with no frame over 25 ms, so it stays.
- **The camera follows the fit until the user moves it.** `useBoardCamera` keeps no camera of its
  own until a move, so a resized viewport refits; after a move it keeps that place and only the
  limits are applied again. Fitting with `0` returns to following the fit.
- **Lint overrides, each for one file.** `jsx-a11y` counts `role="application"` as
  non-interactive, but DESIGN.md 13 makes the canvas exactly that: a focusable application that
  takes keys and pointers. `src/ui/board/camera-stage.tsx` allows `tabIndex` on that role and turns
  off `no-noninteractive-element-interactions`. `unicorn/no-array-fill-with-reference-type` fires
  on `CanvasRenderingContext2D.fill(path)`, which is not an array fill, so it is off for
  `src/render/thumbnails.ts`.
- **Reference screenshots are committed.** The board's screenshots (16×16, 21×21, 32×32, light and
  dark, with every overlay) are compared with references in `screenshots/` next to the test, named
  `<name>-chromium-linux.png`; the screenshots of failures stay in the ignored `__screenshots__`.
  The runner's iframe is scaled to 0.8, so a 600 px stage is a 480 px picture. A picture may differ
  from its reference in 0.2 % of its pixels (`allowedMismatchedPixelRatio`). References are made in
  `mcr.microsoft.com/playwright:v1.63.0`, the image of the pinned Playwright, as AGENTS.md shows;
  on 09/10 the six made there were byte for byte the ones made on the notebook, and the board tests
  pass in the image.
- **Phosphor only by name, enforced.** `no-restricted-imports` in `src/ui` allows only names that
  start with a capital from `@phosphor-icons/react`, which refuses `import *` and a default import;
  `tests/config/import-fences.test.ts` checks both forms.
- **Pointers in browser tests.** Synthetic mouse events can capture pointer 1, so pan and drag tests
  dispatch them; synthetic touches cannot be captured, so the pinch test sends real touches through
  the DevTools protocol (`tests/support/ui/touch.ts`), converting the iframe's points to the
  page's.
- **Diff fixtures come from known edits.** Each pair in `tests/fixtures/diff/` was written by
  applying the core's edits to a repository maze (three walls put, one taken and a goal cell
  added; five walls taken and the start moved; twelve walls put and the marks cleared; nothing; a
  16×16 against a 21×21), and its `expected.json` was written by hand from those edits, never from
  `diffMazes`.
- **Thumbnails are keyed by the caller.** The cache takes a string key, such as the compact code,
  plus the band; a maze object is not a key, since the library decodes the same maze more than
  once. A thumbnail with a diff is a separate method, `diffThumbnail`, whose `diffKey` names the
  diff, so a key can never stand for a picture without saying which diff it shows.
- **Live mazes are painted, not cached.** The minimap paints the maze being edited straight onto
  its canvas (`ThumbnailCanvas` with `cached={false}`): every edit makes a new code, and caching
  each would leave bitmaps of up to 1 MB in the shared cache. Thumbnail canvases paint again when
  the device pixel ratio changes.
- **Easing curves are tokens.** `--ease`, `--ease-out` and `--ease-drawer` of DESIGN.md 8 live in
  `src/ui/styles.css`, and components use them (`ease-(--ease)`) rather than writing curves; the
  camera's animations in `src/render/easing.ts` need the same curves as numbers. The `--chart-*`
  and `--sidebar-*` tokens of the shadcn template went, since nothing uses them.

## 09/10/2026 — Slice 4a: the shell and the library canvas

- **One camera, two kinds of limits.** `CameraLimits` (fit, zoom range, and how a camera is panned
  into place) replaced the board-only `BoardView` in the pure camera: `boardLimits` keeps 96 px of
  the board on screen, `libraryLimits` fits the grid's width and scrolls it. `useCanvasCamera`
  serves both, and its actions are stable, so a component that only moves the camera does not
  redraw when the camera moves.
- **Virtualization by rows.** The library mounts the rows that cross the viewport and one more
  above and below (`mountedRows`), plus the artboard with the keyboard's focus. Tab onto an
  artboard outside the insets moves the camera without animation; a click does not, since
  `:focus-visible` tells them apart, so a click on a half-visible artboard opens it where it is.
  A new filter fits the grid again in 260 ms. Artboards slide to a new place in 360 ms, which
  animates only the mounted ones: the reflow of DESIGN.md 7 for free.
- **Search words.** An entry is found by its whole name, the name's parts split at punctuation
  and between letters and digits (`japan2011hef` gives `japan`, `2011`, `hef`), the words of its
  competition, its year and its size; a square size in three spellings, any other only as both
  sides (`10x5`, `10×5`), so `5` does not find every 10×5. At `548dcde`, `21` finds exactly the six
  21×21 mazes.
- **Routes.** Anything the hash does not name, or a path that does not decode, is the library
  with the default filter; a filter writes only the keys that differ from the default and replaces
  the history entry. A maze the route names but the library lacks, or a link that does not
  decode, opens the library with a toast. A `.txt` file opens with no route of its own. The
  Library button goes back in the history when the maze was opened from the library, so the
  filter comes back with it, and otherwise goes to the last library route.
- **What the maze screen is for now.** Opening a maze shows it on its board, read only, with the
  title island and the zoom; the flight, the maze list and editing come in slices 4b and 5.
- **What the library leaves for later.** The Folder source (slice 6), New maze and the Mine empty
  state's New maze button (5b), the Changes chip (5c) and the "Mine and files" menu (6 and 7) are
  not drawn yet. On a phone the `+` menu holds Open and the theme until then.
- **Theme before the first paint.** A small script in `index.html` puts `.dark` on the page and the
  desk colour in the one `<meta name="theme-color">` before React loads, from `?theme=` or the
  system; `useTheme` (zustand) keeps the session's choice. The manifest's colours stay as slice 0
  set them until slice 7.
- **Primitives.** Button, Tooltip and DropdownMenu are the monitor's shadcn copies, with their
  Lucide icons swapped for Phosphor's (DESIGN.md D3); the monitor has no Toggle or ToggleGroup, so
  those were written from shadcn's `new-york` source. Toasts are Radix `Toast` with a small zustand
  store, as DESIGN.md 6 asks; no `sonner`.
- **Thumbnails paint in idle time.** A thumbnail canvas holds the bitmap of its band. Its first
  bitmap shows at once when the cache has it; every other bitmap, and every one the cache lacks,
  is painted by `paint-queue.ts` in an idle period with at least 8 ms left: a 16×16 or a 32×32
  takes 3 to 6 ms to paint at 4× CPU throttling, enough to drop a frame. Where there is no
  `requestIdleCallback`, as in Safari, the queue takes a turn every 16 ms that knows nothing of
  idle time and paints exactly one thumbnail, so it always gets through;
  `tests/ui/board/paint-queue-fallback.test.tsx` checks it with `requestIdleCallback` taken away. Until a paint, the canvas keeps its previous
  bitmap, scaled, or its floor colour (DESIGN.md 12).
- **Artboards carry a crisp shadow, not the slab's.** The board's slab shadow (`0 18px 40px -22px`)
  on 30 mounted artboards is repainted at every zoom step. Three ways to keep its look were
  measured with the library's performance test, three runs each of the median of three, zooming at
  4× CPU throttling (frames over 25 ms; the budget is 1 %):
  - the slab as a CSS `box-shadow`: 1 to 2.5 %;
  - the same shadow blurred once into a nine-slice image, cast as a `border-image` that scales with
    the camera (it looks the same as the slab at 400 %): 1.5, 0.5 and 1.0 %, one run failing;
  - the slab only once the camera has been still for 150 ms, the crisp shadow while it moves:
    1.0, 1.0 and 1.0 %, the stop and the start each costing a frame;
  - `--artboard-shadow`, a hairline ring and a 2 px drop with no blur: 0, 0.5 and 0.5 %.

  Only the last one leaves room in the budget, so it stays. The editor's board keeps the slab.

- **How the library was measured.** `tests/ui/library/library-performance.test.tsx` mounts the
  whole app with the 581 mazes at 1440 × 900, slows the CPU 4× through the DevTools protocol
  (`Emulation.setCPUThrottlingRate`), and takes the median of three runs of 200 frames, dragging
  with the middle button and zooming with Ctrl and the wheel. On 09/10, over three runs of the
  test: drag p95 16.7 to 16.8 ms with 0 to 0.5 % of frames over 25 ms, zoom p95 16.7 to 16.8 ms
  with 0 to 0.5 %, and at most 30 artboards mounted. It runs on React's development build:
  switching the performance project to the production build through `define` reached the other
  browser project, which shares its server, and broke `act` there. The production build is
  measured in the e2e project instead (`tests/e2e/library-frames.test.ts`, the built app at 4×
  throttling through a CDP session, the same motions run in the page): over three runs, drag p95
  16.7 to 16.8 ms with 0 % over 25 ms, zoom p95 16.7 ms with 0 to 0.5 %. It held steady, so it is
  a gate of the check like the rest of the e2e project.
- **The bundle.** The first screen now loads 150.1 KB gzip (72.6 KB before): React, Radix's
  tooltip, toggle group, dropdown menu and toast with what they stand on, Phosphor's icons and the
  shell. React and Radix get chunks of their own (`codeSplitting` groups), so the app's own chunk,
  42.6 KB gzip, shows what the app weighs; the largest chunk, React's, is 219 kB before gzip.
- **One build for every e2e file.** `tests/support/e2e/serve-app.ts`, the e2e project's global
  setup, builds the app under `/maze-studio/` into `node_modules/.tmp/` once and serves it; each
  file reads its URL with `inject('appUrl')`.
- **axe counts every impact.** `axeViolations` fails on any violation, minor and moderate ones
  included. That found the skip link outside a landmark: it now sits in a `nav` named "Skip link"
  and points at the canvas's `id`, `canvas`.
- **Safe areas on a phone.** The phone's islands, the maze screen's islands and the toasts sit 8 px
  (12 px at the bottom) plus the safe-area inset of their edge, through small utilities in
  `src/ui/styles.css` (`top-safe-2` and the like).
- **Quiet zoom, announced emptiness.** The zoom percentage is plain text, not a live region that
  would speak at every frame of a zoom. An empty library is announced through a live region that
  is always mounted, since one mounted with its text is not read.
- **Opened files up to 1 MiB.** A larger `.txt` is refused with a toast before it is read; a 64×64
  maze is under 40 kB.

## 09/10/2026 — Slice 2b: the snapshot follows the submodule

- **Dependabot moves the mazes, CI merges them.** The owner chose to keep the library in step with
  mazefiles through Dependabot's `gitsubmodule` updates, weekly, merged automatically once CI
  passes (PLAN.md 11). `mazefiles-auto-merge.yml` reads `dependabot/fetch-metadata`'s ecosystem
  and the changed files through `gh`, and only for a pull request that changes `vendor/mazefiles`
  alone does it run `gh pr merge --auto --squash`. Its token has `contents: write`,
  `pull-requests: write` and read access to checks and statuses, nothing else.
- **The snapshot is generated, not committed.** `src/library/snapshot.json` is in `.gitignore`;
  the `pre` scripts of `dev`, `build`, `lint`, `typecheck`, `test`, `test:unit`, `test:browser`,
  `test:performance` and `test:e2e` run `bun run snapshot`, which writes it from the submodule
  unless it already holds the submodule's commit and the submodule has no local change. CI and
  `pages.yml` run those scripts, so a bump needs nothing else. The file generated at `548dcde` is
  byte for byte the one committed before.
- **Corpus tests check invariants, not one commit's numbers.** Gone: the pinned hash, the 581
  files, the size tallies (523, 16, 33, 6, 3), the proof-rule counts (100, 2, 54) and the two files
  that end in two line feeds. Kept: blob SHA, byte-for-byte and compact-code round trips, no
  irregularity, no `error` under the folder's profile, the submodule checked out at its gitlink,
  and the snapshot equal to the submodule. A floor of 500 files catches an empty submodule; the
  sizes and rule counts are logged. Counts elsewhere (the catalog, `21` in the search, the credit)
  are now read from the snapshot. Tests that open named mazes (`japan2011hef`, `AAMC15Maze`,
  `taiwan2015hef`, `japan2016hef`) would need a look if upstream ever edited or removed those
  files; new mazes never touch them.

## 09/10/2026 — Slice 4b: the flight, the open maze and the quick list

- **`cmdk` 1.1.1 for the quick list**, the monitor's version, as PLAN.md 3 foresaw: its `Command`
  gives the listbox, the highlight that the arrows move and the selection, and it runs with
  `shouldFilter={false}`, so the list filters with the library's own `SearchIndex` and passes
  only the matches. Its own code is about 4.4 KB gzip; it stands on Radix's dialog, which the
  phone's sheet uses anyway. The first screen loads 161.4 KB gzip after this slice (150.5 KB
  before), with the studio's code and the sheet.
- **One canvas for the library and the open maze.** `Studio` replaced the library and maze
  screens: the artboards and the open maze's board lie in one world under one camera, whose
  limits are the library's or the board's. Opening an artboard flies the camera 620 ms to the
  editor fit of the board, which lies in the artboard's own cell, so nothing moves on landing; the
  camera is free of both limits only while it flies. Leaving flies 520 ms back to the artboard of
  the maze on screen, starting from the camera that keeps the board where it is on screen. A maze
  that has no artboard (a link, a file) lies in a cell of its own left of the grid and arrives and
  leaves without a flight, as does any maze with reduced motion or opened by its route on a fresh
  load. Its state lives in a small zustand store per studio, which the route changes drive from
  layout effects.
- **The route of an artboard is pushed at once.** A plain click calls `pushState` and fires the
  app's route event, rather than letting the link set the hash, whose `hashchange` comes a task
  later; so with reduced motion the editor is there in the next frame. A modified click still opens
  a new tab.
- **The quick list previews in place.** The highlighted maze takes the board's place in the cell
  the open maze came from, without a flight and without moving the URL; Enter or a click pins it
  by replacing the route, Esc puts back the pinned one. Its rows are memoised with a stable pin
  handler: re-rendering all 580 of them at each preview made 50 ↓ in a row cost three frames each
  (p95 50 ms); now only the rows whose selection changes render.
- **View mode.** A maze opened on a phone, or by a touch at any width, is open to look at: one
  finger pans and a pinch zooms. The Edit button that leaves view mode comes with editing, in
  slice 5a; until then a notebook's mouse does nothing on the board but the camera's own gestures.
- **One finger pans the library.** The library's canvas pans with the primary button or one finger
  once the press moves past 5 px, and swallows the click that ends such a drag, so a tap still
  opens an artboard. Slice 4a left the phone's library with only the two-finger pan.
- **Measured.** At 1440 × 900 without throttling, the median of three: the flight in and the
  flight back at p95 16.7 ms, no frame over 25 ms, worst 16.8 ms; 50 ↓ through the open list at
  p95 16.7 ms, no frame over 25 ms. In the e2e project, on the production build, the board's
  centre stays 0.00 px from the straight line through the flight (39 frames), and its box moves
  less than 0.5 px between landing and 350 ms later.
- **Screenshots at the iframe's own scale.** Once the studio's heavier browser files ran beside
  them, the 16×16 board screenshots failed about one run in two, every edge a fifth of a pixel
  apart. The 4b review corrected the first reading (load) and the 500 ms wait it led to; see the
  slice 4b review below.
- **The studio keeps the library's zoom cheap.** Moving the camera into `Studio` brought back a
  regression 4a had fixed: the library's islands re-rendered at every frame (their filter callback
  followed the whole camera object), and so did the zoom island's three Radix tooltips; the
  library zoom at 4× throttling fell to 6.5 to 14.5 % of frames over 25 ms. The filter callback is
  now a `useCallback` over the camera's stable actions, the zoom island sits apart in an `aside`
  named Zoom, and its buttons are memoised, so only the percentage re-renders: 0 to 1 % again.
  The minimap of an open maze mounts only once the camera has landed, so the flight's first frame
  does not also paint it.

## 09/10/2026 — Slice 2b review

- **Why `pull_request_target`.** GitHub's documentation (Troubleshooting Dependabot on GitHub
  Actions) says a Dependabot `pull_request` run gets a read-only `GITHUB_TOKEN` and only Dependabot
  secrets, and that the `permissions` key can raise the token; GitHub's own auto-merge example uses
  `pull_request`. So `pull_request_target` is not needed for the token. It is kept because it runs
  the workflow as it is on `main`, so a pull request cannot change what runs with write access; the
  job checks out nothing from the pull request either way. `dependabot/fetch-metadata` is pinned
  to the commit of v2.5.0 (`21025c7`).
- **The workflow waits for the required checks.** Before turning on auto-merge it waits up to 50
  minutes for the required checks to appear, within the job's 90-minute limit, then runs
  `gh pr checks --required --watch --fail-fast`; when `main` requires none, that fails and nothing
  merges, so an unprotected `main` can never merge a bump untested.
- **Publishing after an automatic merge.** A merge made with `GITHUB_TOKEN` starts no workflow, so
  neither `ci.yml` nor `pages.yml` runs on `main` after a bump; CI already ran on the pull request,
  but the site would keep the old mazes. Chosen without secrets: `pages.yml` also runs every
  Monday at 12:00 UTC, six hours after Dependabot's 06:00 UTC, besides `workflow_dispatch`. For a
  deploy at the moment of the merge, the merge would need a GitHub App installation token or a
  fine-grained personal access token, kept as a Dependabot secret; the README says so.
- **`pretest:watch`** generates the snapshot too, like the other test scripts.

## 09/10/2026 — Slice 4b review

- **The board screenshots are deterministic.** The cause was not load but a scale: with the UI off,
  Vitest shrinks the tester iframe to fit its page with `transform: scale(…)`, and Playwright's
  default page is 1280 × 720, so the 1440 × 900 iframe ran at 0.8. Chromium rasterises such a
  layer at a provisional scale and adjusts it a few frames later, and the screenshot caught one or
  the other (the camera, the geometry and the frame logged identical). The browser context now has
  the tests' own 1440 × 900 viewport, so the scale is 1 (`@vitest/browser-playwright` leaves this
  as a TODO), the references are 688 × 688 instead of 551 × 551, and the 500 ms wait is gone.
  The stage also fits the board at exactly k = 1, and the harness passes its size to the camera, so
  the first frame has the final camera. Proof, the browser project: before, 3 of 5 runs failed in
  parallel and 2 of 5 with `--maxWorkers=1`; after, 5 of 5 and 5 of 5 passed.
- **A drag from an artboard pans.** Writing the test showed that a real mouse drag from an artboard
  did nothing: the link started the browser's native drag, which cancels the pointer. The artboard
  is no longer draggable. In Chromium the pan's pointer capture sends the closing click to the
  stage; the stage still swallows a click that ends a drag, for engines that send it to the link,
  and a browser test of the stage covers that.
- **The flight's curve is tested from DESIGN.md's numbers.** The e2e test records each transform of
  the world with its time, turns the zoom into eased progress and fits the start time;
  `cubic-bezier(0.45, 0, 0.12, 1)` written in the test, not the app's constant, matches within
  0.002 to 0.007 over 21 samples, against 0.046 for `EASE_OUT`, 0.109 for `ease-in-out` and 0.231
  for a linear flight.
- **The production frame gate is calibrated to the machine.** Before measuring, a fixed JavaScript
  workload (20 million steps of an LCG and a square root, the median of seven runs after a warm-up)
  is timed unthrottled in the page; the throttle is `clamp(4 × 27 ms / measured, 1, 4)`. The 27 ms
  reference is the median on the reference notebook, an i5-12500H with 16 threads, in Chromium of
  Playwright 1.63, five contexts of 26.8 to 29.3 ms. Slowing the page 2× and 3× gives 55.8 ms and
  84.4 ms, so rates 1.94 and 1.28: a CI runner with two vCPUs is no more than 4× slower than the
  notebook in all.
- **The phone's list focuses the list.** Without autofocus on a phone, so the on-screen keyboard does
  not cover the list, the sheet focuses cmdk's root instead, and the arrows and Escape still work.
  On a notebook the filter takes the focus; closing the list gives it back to the element that
  opened it.
- **`useStudioFlight`** holds the flights, out of `studio.tsx`; the world layer has
  `will-change: transform` only while it flies.

## 09/10/2026 — Slice 5a: the editor's base

- **The editing session lives in `App`.** The first edit of a maze that is not in Mine copies it
  there and replaces the route with `#/mine/<uuid>`, before the library has loaded the copy. Kept
  in `App`, the session answers for that route meanwhile, so the route is never taken for a missing
  maze; once the route has moved to the copy, the original's route opens the original again, in a
  new session. Any other maze starts a new history. The session itself (`edit-session.ts`) is pure
  and tested in Node; the hook only keeps it and writes.
- **The copy.** Named `uniqueName("<name> (edited)")` against Mine's names, with the original's
  text after the grid, its profile (the repository folder's, or free for a link or a file) and,
  from the repository, its path and blob SHA. The original never changes; undoing every step saves
  the copy back to the original file byte for byte. A `.txt` file is now named by its file name
  without `.txt`: it was `fileStem`'s `corridor-txt`, which only a download name should be.
- **Autosave**, after every gesture, one write at a time, the latest state winning, so a burst of
  gestures makes at most one more write. The copy and every save reload this tab's library through
  a window event, since Mine's `BroadcastChannel` does not reach the tab that writes. A save that
  Mine refuses, because another tab saved a newer version, turns the maze read-only with the ink
  island of DESIGN.md 12; a browser that keeps Mine only best-effort gets its toast at the copy.
- **The stage arbitrates the pointer.** `CameraStage` takes a `drawing`: the primary button or one
  finger draws when it does not pan (Hand, view mode, Space, the middle button), and a second
  finger takes the drawing back and pinches, so one finger draws and two pan and zoom. The drawing
  gets every coalesced position of a move. A finger previews the slot it pressed and changes it
  only on release or once the stroke steps on, so a pinch that starts leaves nothing behind. A
  touch on cells under 28 px does not edit and the hint says "Zoom in to edit": at 390 × 844 a
  16×16 fits at 22.6 px a cell and edits from 28.3 px, a 32×32 fits at 11.4 px, does not edit at
  27.8 and edits at 34.7.
- **The keyboard.** The first arrow shows the cursor at the start, or at (0, 0), and the next ones
  move it; Shift and an arrow toggle that side's wall, a step each, and the camera keeps the cursor
  inside the editor's insets without animation. The tools island takes `↑`, `↓` and every Shift
  and arrow in its capture phase and hands them to the board with the focus; `←` and `→` stay
  Radix's, which moves the focus a task later, so the tests poll for it. `H`, `W`, `Ctrl+Z`,
  `Ctrl+Shift+Z` and `Ctrl+Y` work anywhere but in a text field.
- **Tools of this slice:** Hand and Wall, then Undo and Redo; Rectangle, Clear area, Start and Goal
  come with slice 5b. The active tool is styled by `aria-checked`, because the tooltip's trigger,
  on the same element, writes its own `data-state` over the toggle's `on`. On a phone, and after a
  touch opened the maze, the eye leads back to view mode.
- **Measured.** A stroke over a 32×32, one move a frame for 200 frames, the median of three: p95
  16.7 ms, no frame over 25 ms, worst 16.8 ms. Each move re-renders the board's SVG, which is cheap
  enough not to need anything finer.
- **Both frame gates are calibrated.** The browser project's library gate now throttles by the same
  benchmark as the production gate, run in its own page. On the reference notebook that is still
  4×, and there its library zoom spreads from 0 to 1.5 % of frames over 25 ms between runs, as it
  does on the code before this slice: the gate sits at its edge since the tester iframe runs at
  scale 1, and the production gate, with the same throttle, stays at 0 %.
- **Left for slice 5c:** landing on the copy in Mine, with the filter turned to Mine, when leaving
  an edited maze (PLAN.md 3.4, Flight, and 11).

## 09/10/2026 — Slice 5a review

- **Autosave keeps a session per maze.** With one waiting session for the whole writer, leaving a
  maze while a write ran dropped its last change (A edited twice, then B once: A's copy lacked the
  second edit). Each maze now keeps its latest session waiting, the writer empties them all in the
  order asked, and a write that throws is reported and the others still run; the next change of
  that maze tries again. Unit tests with a Mine in memory cover the order, the grouping, the switch
  in the middle of a write, the refusal and the failure; an e2e test opens one copy in two tabs of
  one context and the tab that saves second turns read-only.
- **The read-only notice** is spoken by a live region that stays mounted, and the ink island beside
  it is hidden from screen readers; the toast that also said it is gone.
- **Undo and redo read ⌘** instead of Ctrl in their tooltips on Apple's systems.
- **On a phone, edit mode keeps 84 px** under the board for the tools and view mode 88 for the Edit
  button (DESIGN.md 7); the flight in fits with the inset of the mode it lands in.
- **The development frame gate allows 2 %.** The browser project's library gate, on the development
  build in the tester's iframe, spreads from 0 to 1.5 % of frames over 25 ms on the reference
  notebook, before and after this slice; it now allows 2 %, and the e2e project's production gate,
  which stays at 0 %, holds DESIGN.md 8's 1 %.
- **For the owner:** "Zoom in to edit" shows in the tool hint, which is `aria-hidden` as DESIGN.md 6
  has it, so a screen reader hears nothing when a touch on small cells does not edit.
- **Re-review.** The writer keeps the last version this tab saved of each item of Mine, and saves on
  the larger of it and the session's, so going back at once to a maze whose library entry is still
  the older version is not refused as a conflict. The platform for ⌘ comes from
  `navigator.userAgentData`, with `navigator.platform` as the fallback.

## 09/10/2026 — Slice 5b: the tools, Checks and New maze

- **The cell tools apply on release.** Rectangle, Clear area, Start and Goal pick a cell on the
  press and span a rectangle with a drag, shown as the selection; the release applies it as one
  step (`cellEdit`, pure). A goal click replaces the goals, Shift and a click add or take away the
  cell, and a drag, with Shift or without, makes the area the goals. With the keyboard, Enter puts
  the start; with the others, a first Enter marks a corner and a second applies the area, and
  Escape drops the corner. `setGoalArea` joins `src/maze`'s edits for the goal's rectangle.
- **New mazes** come from `presetMaze` and `borderedMaze` in `src/maze`: Classic 16 × 16 and Half
  size 32 × 32 with the start in (0, 0) walled east and the goals of the plan, Training and Custom
  size with the border only, none with an error under their profile. They open like a `.txt` file,
  without a route, under `uniqueName("Untitled maze")` or the name the dialog gives, and come to
  Mine at their first edit under that name rather than "(edited)" (`created` in the document).
- **Checks** run `validateMaze` on the maze on screen with the session's profile, and with the
  file's source while the maze is unchanged (the repository's files open with the clean source of
  PLAN.md 3.1), so the rules of the file count until the first edit. The profile is part of the
  session, not a step of undo, and is saved with the copy. A finding clicked marks its place with
  the focus overlay and brings it on screen without animation; the selected finding belongs to its
  maze. Hints get Phosphor's `Info`, which DESIGN.md 4 does not map, beside its icons for errors and
  warnings.
- **Primitives:** shadcn's Popover, Dialog, Input and Label, on the `radix-ui` package already
  there; no new dependency.
- **The first screen grew** to 86 KB gzip for the app's chunk (65 KB before) and 37 KB for Radix:
  the validation, which the Checks chip needs on screen; the dialog, popover and label; and nine
  more Phosphor icons, each of which ships its six weights. With React's chunk and the CSS the first
  screen is about 201 KB gzip, under the 250 KB of PLAN.md 6.
- **The flight's easing test reads the frame's time.** Mounting the editor's islands made one frame
  of the flight heavier, so the time taken in the MutationObserver lagged the frame and the fitted
  curve was off by more than 0.02 once in three runs; `document.timeline.currentTime`, the frame's
  own time, puts it within 0.001.
- **The checks, the menu and the tools mount when the camera lands**, fading in, as the minimap
  already did: the flight's first frame mounts the open board and stays lighter. That first frame
  still runs over 33 ms in about one run in four of the development flight gate, at 33.4 ms, before
  this slice as after it.

## 09/10/2026 — Slice 5b review

- **Icons from `@phosphor-icons/core`, a devDependency.** `@phosphor-icons/react` ships every icon
  in its six weights, and named imports do not prune them. `scripts/icons.ts` (`bun run icons`)
  reads the regular SVGs of the icons the app uses from `@phosphor-icons/core` 2.1.1 and writes
  `src/ui/icons.tsx`, one small component per icon with its one path; `tests/config/icons.test.ts`
  keeps the file what the script writes. The React package is gone, and the fences refuse any
  `@phosphor-icons/` import in `src`, so icons come only from `@/ui/icons`. The app's chunk went
  from 86.0 to 73.4 KB gzip, and the eager first screen counts 182.1 KB.
- **The flights in the production gate.** The e2e project now flies into a maze and back three
  times on the built app at the calibrated throttle and holds DESIGN.md 8: p95 at most 20 ms, at
  most 1 % of frames over 25 ms, none over 33 ms. Making it pass found four things:
  - the flight back did not move: the render that left the maze already held the camera to the
    library's limits, so the flight started from where it lands. It now starts from the editor's
    camera of the last render, and `jump` moves the camera a flight then starts from; an e2e test
    checks that the board shrinks frame by frame to its artboard;
  - the artboards' labels and rings, counter-scaled by `--k`, changed at every frame, which
    repainted the promoted world while they faded. During a flight they keep the library's zoom,
    the zoom it starts from or lands on (`fixedScale`);
  - the board's mount is taken off the click: a press on an artboard mounts its board hidden, and
    the click's frame only shows it; the editor's chrome, and the checks, menu, tools and minimap at
    the landing, mount in deferred renders that React splits across frames;
  - a flight's clock starts two frames after the call, past the frame that draws what started it,
    and the gate counts the frames of the motion, from the frame before the camera first moves to
    three frames after the landing.
    Four runs at 3.36 to 3.99× on the reference notebook: flight in and back at p95 16.7 to 16.8 ms,
    no frame over 25 ms, worst 16.8 ms. The development flight gate presses before it clicks, as a
    person does.
- **"Zoom in to edit" is spoken** by a live region that stays mounted, emptied and written again at
  every refused tap; DESIGN.md 13 lists it.
- **On a phone the Checks chip shows its count**, and the live region that says "Checks: 2 errors"
  sits beside the button rather than in it.
- `isTool` asks `Object.hasOwn`, and the shortcut help has Esc.

## 09/10/2026 — Slice 5c: Changes

- **The session's changes live in one in-memory store** (`src/ui/changes/session-changes.ts`, pure
  functions over a zustand store), fed by the editor's writer: a copy or a new maze enters when its
  first edit writes it to Mine, with the maze it was copied from as its baseline and the route it
  came from; a maze of Mine from before the session enters at its first save, against the state the
  session first opened it in. A reload starts another session.
- **The line of an item** comes from `diffMazes`: "3 walls added, 1 removed, goal changed",
  "New maze", or "No differences" once back at the baseline, which never takes the item out. The
  row's thumbnail draws the diff through `ThumbnailCache.diffThumbnail`, keyed by the baseline's
  compact code.
- **Discard**, in two clicks with 3 s armed, deletes a copy or a new maze from Mine and, if it is
  open, goes back to the route it came from (the repository file, the link) or to the library; for
  a maze of Mine from before, it saves back the session's first state and puts it on screen in a
  new session. **Keep** takes the item out and changes nothing else. The ⋯ menu opens the panel even
  with nothing in it.
- **One panel for the studio**, a popover anchored under the islands at the top right on a
  notebook and a sheet on a phone; the chips in the editor's island and in the library's actions
  island open it. "Show on board" and `D` draw the diff of the maze on screen.
- **Leaving a maze of Mine changed in the session** for the library, by the Library button or the
  browser's Back, shows Mine and lands on its artboard: `App` remembers the maze on screen at the
  route before and, on reaching the library from such a maze, replaces the filter with Mine.

## 09/10/2026 — Slice 5b re-review

- **The world layer is untouched while the camera is free.** The library's production zoom had lost
  its margin (0 to 1.0 % of frames over 25 ms in six runs, 0 % before), and the bisect pointed at
  the world layer's new marks. `data-promoted` and `group/world`, and the open board's
  `will-change: opacity` that read them, never showed a gain and are gone; only `fixedScale`
  stays, and only during a flight. Six runs: 0.0 % over 25 ms, worst 16.8 ms.
- **The flight's fixes are observable.** The e2e flight tests check that `--k` keeps one value
  through the flight in and through the flight back, and that a press on an artboard mounts its
  board hidden before the click opens it; removing either fails them.
- **Icons are hidden from screen readers by default**: `aria-hidden` on the generated SVG, which a
  caller may override.
- **The 250 KB budget is reported only** (the owner's decision, as in the monitor): `bun run size`
  prints the first screen's size and never fails, it is no criterion of a slice being done, and the
  size is not optimized only to fit the number. Each slice reports the size and how it moved.

## 09/10/2026 — Slice 5c review

- **The armed Discard reads in both themes**: `--destructive-foreground` is near white on the light
  theme's red and near black on the dark theme's lighter red (white on it gave 2.9 : 1), and the
  armed button keeps its fill on hover. The panel's test runs axe with Discard armed in both.
- **Discard of a maze of Mine from before the session** saves back its first state, maze and
  profile, on the version this tab saved last; if another tab saved since, the save is refused, the
  item stays and a toast says "Could not discard <name> (changed in another tab)".
- **Keep then a new edit**: Keep takes the item out and notes the maze's state then; a later save
  brings the item back as a maze of Mine, compared with that state (DESIGN.md 6.2).
- "Show on board" names `D` in `aria-keyshortcuts`, its `kbd` is hidden from screen readers, and
  the panel's buttons are 40 px tall on a phone.

## 09/10/2026 — Slice 6: sharing, saving and files

- **Copy link** puts `#/m/<code>` on the clipboard: the walls, the marks and the name, never the text
  after the grid, which a toast says when the maze has some. Without a clipboard, as over plain
  HTTP, a selected text area and `execCommand('copy')` try next; if that fails too, the link goes in
  the address bar with "Copy failed, link is in the address bar". On a phone, Copy link and Share…
  (Web Share, where the browser has it) are in the ⋯ menu.
- **Download .txt** writes the canonical text with the text after the grid, under the stem
  `uniqueStems` gives the name (`AAMC15Maze (edited)` → `AAMC15Maze-edited.txt`).
- **Save to Mine** copies a link or a `.txt` under its own name, edited or not; an edit copies it
  too, as "<name> (edited)". Both enter Changes.
- **The local folder** (`src/library/folder.ts`, `useLocalFolder`) is the third source, Folder,
  while it is open: its `.txt` files by name, those that do not parse skipped and counted in the
  source's tooltip. Its handle is kept in IndexedDB; a later visit reads the folder at once when
  the browser still grants it, else `#/folder/<file>` falls back to the library with "No access to
  the folder. Open it again to allow.". A folder maze edits into a copy in Mine, and Save to folder,
  which shows only once that copy exists, writes it back over its file, asking for write permission
  inside the click; the copy stays in Mine and the source rereads the folder. Open folder is the
  only item of the "Mine and files" menu until slice 7 brings Export all, Import and Check for
  updates; where the browser has no folder picker, the menu is not there.
- **The handle in a context that is not persistent.** Reading the handle back out of IndexedDB
  still crashes the page in Playwright's off-the-record contexts (a reload after Open folder closes
  the page), so the folder's e2e tests run in a persistent context with a picker that gives a folder
  of the origin's private file system; whether Chrome's incognito windows crash the same way is not
  checked here.
- **Rename and Delete**, for a maze of Mine, in the ⋯ menu. Rename goes through the writer, on the
  version this tab knows, so autosave after it is not refused; Delete takes a second select, then
  opens the library on Mine.
- **Menus close at once.** With an exit animation, a menu whose item started a download or wrote
  the clipboard could stay mounted, closed, in Chromium, and its outside-click layer ate the next
  click; the menu triggers have no tooltip either, which covered the first item. Downloads and
  Share… start once the menu has closed.
- **Size:** the first screen counts 192.7 KB gzip, +5.1 KB with this slice.

## 10/10/2026 — Slice 6 review

- **One copy per maze.** The writer keeps the copy on its way for each opened maze and registers it
  at once: a second Save to Mine waits for it, and an edit written meanwhile saves into it.
- **Save to folder checks the disk first.** The folder keeps the text it read of each file; before
  writing, the file is read again, and if it changed a dialog says "<file> changed on disk" and
  writes only on "Save anyway".
- **Reading the folder never stops at one file.** A file that cannot be read, or is over 1 MiB, is
  skipped and counted without reading its text; the restore of the folder kept from an earlier visit
  always ends, in a `finally`.
- **Rename refuses a name already in Mine**, compared without case, beside the field.
- **The ⋯ menu has Fit and the theme** too.
- **The folder's handle is kept only where the storage is persistent.** Open folder asks for it
  (`persisted()`, else `persist()`); without it, the handle is not stored, so a private window does
  not read a handle back on reload. Checking this showed that the reload crash in Playwright's
  off-the-record contexts comes from the origin's private file system the tests stand the folder on,
  not from IndexedDB: the page dies on reload after Open folder even with nothing stored. The folder's
  e2e tests keep to a persistent context; the one without persistent storage checks that nothing is
  stored, without a reload.
- **`expectToast`** looks inside the toast viewport and expects exactly one visible toast; Radix's
  copy for screen readers lies outside it.

## 10/10/2026 — Slice 7: PWA and finish

- **The "Mine and files" menu is always there**, on the notebook's actions island and in a phone's
  `+`: Export all, Import…, Open folder… (only where the browser has a folder picker; absent, not
  disabled) and Check for updates.
- **Export all** downloads `maze-studio-mine-<local date>.zip` and says "Exported N"; when an item
  does not read, "Exported N, skipped M" with Details, a dialog with each skipped maze and why.
  **Import** takes `.zip` and `.txt` files, names each maze uniquely in Mine (a clash becomes
  "<name> 2"), and shows a report of what was added, renamed and skipped with the reason; with
  anything added, the library turns to Mine. Imported mazes are not session Changes: nothing was
  edited.
- **A toast with an action stays 8 s**, not 2.4 s, so its button can be reached; Radix pauses it on
  hover and focus. The new version's toast stays until Reload or its close button.
- **Check for updates** runs the updater at once; the credit island adds what it found: "Checking
  for updates…", "Up to date", "Updated" or the reason of a failure with the commit in use
  ("Offline, using the copy from 548dcde"), in an `<output>` so it is announced. The credit's count
  and commit are those of the snapshot or of the cache the library reads. The automatic daily check
  runs only in production builds; the e2e build turns it off (`VITE_AUTO_UPDATES=off`) and routes
  GitHub itself where a test needs it.
- **An empty Mine offers New maze** in its island; a search that finds nothing does not.
- **Icons:** `Export`, `UploadSimple` and `ArrowsClockwise` join the generated set, as DESIGN.md 4
  maps them.
- **Downloads** of a `.txt` and of the zip share `downloadBlob` (`src/ui/download.ts`).
- **Audit (`web-design-guidelines`).** Fixed: islands keep off the notch and rounded corners in a
  phone held sideways too (`top-safe-*`, `left-safe-*`, `right-safe-*`, `bottom-safe-*` take any
  spacing or length); `touch-action: manipulation` and no tap highlight on the page; the Button's
  transitions listed and its ring 2 px with a 2 px offset; a focus ring on the list's filter and on
  the toast viewport; `overscroll-contain` on lists and the report; Toggle hover raises contrast;
  shortcuts in mono, without letter spacing; the credit's pills fit a phone; an `<h1>` in the
  library; `name`, `autoComplete="off"` and `spellCheck={false}` on the dialogs' fields, which take
  the focus only under a fine pointer, so a phone's keyboard does not cover the dialog; error copy
  with a next step where DESIGN.md does not fix the words; maze names, paths, file names and the
  commit inside toasts, the confirm dialog, the Save to folder hint and the credit note marked
  `translate="no"` (`Verbatim`); the manifest's colours are the dark desk, `#191919`; the quick
  list's rows use `content-visibility: auto`.
- **Left as they are.** `overscroll-behavior-y: none` on the page, against pull-to-refresh on
  Android, is the owner's call, still open. Counts and percentages stay as written: the app is in
  English only, and `Intl.NumberFormat` comes with a second locale. The Checks findings carry no
  coordinates or names to mark. The audit's other points are DESIGN.md's own choices: sentence
  case, Save and Create disabled while a field is invalid, menu triggers without tooltips, menus
  without exit animation, the canvas as `role="application"`, no URL for previews and loose mazes.
- **Size:** the first screen counts 201.1 KB gzip, +6.5 KB with this slice.

## 10/10/2026 — Slice 7 review

- **`settled()` waits for two quiet frames in a row**, and for every finite animation it meets on
  the way, so axe never measures an island fading in after a deferred mount; the editor's axe test
  also waits for the editor's islands at full opacity.
- **The median run of a frame test** is the middle one by its share of slow frames, then its worst
  frame, then its p95, so one stray frame of a loaded machine in one run does not decide. The
  flights keep "no frame above 33 ms" on that run.
- **Import refuses before reading** a `.zip` over 32 MiB and any other file over 1 MiB, the zip
  reader's limits, with the reason in the report.
- **Reload into a new version waits** for the writes to Mine on their way (`pending-writes.ts`).
- **A static test** (`tests/config/safe-areas.test.ts`) fails a `fixed` element of `src/ui`, outside
  the primitives, that sits by an edge without its safe-area inset.
