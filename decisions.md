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
- **Primitives** are the monitor's shadcn copies with Phosphor icons, Badge and Switch among them; Toggle, ToggleGroup,
  Popover, Dialog, Input and Label come from shadcn's `new-york` source over the `radix-ui` package, and the Sheet
  takes shadcn's `side`, bottom or right. Toasts are Radix `Toast` with a small zustand
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
  for the required checks, so an unprotected branch never merges a bump untested. A merge made with `GITHUB_TOKEN`
  starts no workflow, so after a bump lands on `main` the auto-merge workflow starts Pages by `workflow_dispatch`, the
  one event that token may start.
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
- **No local folder** (owner, 30/10, #32). Open folder, the Folder source and Save to folder are gone: Import… takes
  several `.txt` files or a `.zip`, Download .txt writes one out, and nobody in the team kept mazes in a folder on disk.
  On load the app deletes the folder handle an older version kept in `settings`; mazes copied from a folder stay in My
  mazes. The way back is a working folder that also writes new mazes into it (a name field, Close folder, desktop
  Chrome and Edge only), for the Micras simulation's maze folder; the design is in #32.

## Drawing

- **The track's colours are values** (`TRACK_COLORS`), the same in both themes, since canvas thumbnails cannot read CSS
  variables. The UI's colours, shadows and easing curves (`--ease`, `--ease-out`, `--ease-drawer`) are tokens in
  `src/ui/styles.css`; `src/render/easing.ts` holds the same curves as numbers for the camera.
- **Thumbnails are keyed by the caller** (a string, such as the compact code, plus the band). A thumbnail with a diff
  is `diffThumbnail`, keyed by the diff too. Walls and posts are at least 1 device pixel and the outer ones end inside
  the bitmap, in every band.
- **Thumbnails paint in idle time** (`paint-queue.ts`), in idle periods with at least 8 ms left. The library's
  artboards also paint at the next animation frame when that comes first, as all through a fling on a phone,
  which leaves almost no idle time (issue #16): a frame paints one thumbnail, then starts previews only, for 5 ms
  more, so it never starts a second 6 ms paint; the quick list's rows do not paint in frames, as one a frame cost it a
  dropped frame while ↓ is held. Without `requestIdleCallback` only the frames paint, for the whole app, the
  library's previews first. A cached bitmap shows at once; until a paint the canvas keeps its
  previous bitmap, scaled, or shows what is under it.
- **The library shows a preview first** (owner, 30/10, issue #16). A fling on a phone outran the one paint a frame,
  and scrolling back over the same artboards found them blank again: the 64 MB cache holds about 64 bitmaps of the
  512 band, fewer than one 9000 px fling passes. An artboard now shows its 128 band first, painted in the frame, and
  the sharp band in idle time, once the scroll settles. The 128 band takes 2.5 ms against 6 ms for the 512 one at four
  times throttling (most of a paint is building the paths, whatever the size), so a frame paints two; the 64 band
  saves nothing more and loses a 32 × 32 maze's walls. Bands up to 128 sit in an LRU of their own, 40 MB, a preview of
  every maze of the repository (583 mazes, 36.4 MB): the app may now hold 104 MB of bitmaps instead of 64. Until
  its preview, an artboard shows the generator's skeleton, still, as a CSS background drawn once per size, so a fling
  pays nothing for it. Measured at 200 px a frame, 390 × 844 at three times, four times throttling: blank artboards
  went from 86 % to 17 % on the first pass and from about 25 % to 0–0.5 % on later ones, and frames over 25 ms from
  35 % to 1.5 %. Without `requestIdleCallback` the blanks fall alike (84 % to 18 %, 25 % to 0–5 %), but frames over
  25 ms stay where they were, 34 % before and 38 % after: the sharp upgrades still take a frame each during the fling.
  The skeleton's drawing brings `src/render/loading.ts` into the first screen's chunk, which stays within the budget
  (214.6 of 250 KB).
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
  own. Save to My mazes of a maze not edited is no change
  (owner, 14/10): the copy is noted as a maze of My mazes from before the session, its saved state the baseline, so it
  enters Changes only at a later save and Discard saves that state back. A generated new maze is the exception: Use
  this or Save to My mazes writes it as its first edit would, so it enters Changes as new (#29).
- **The title opens Rename** (owner, 14/10), the dialog of the ⋯ menu, for a maze of My mazes and a new maze: an inline
  field had no confirm button on a phone. Dialogs close without an exit animation, as menus do, so their
  backdrop never swallows the next tap. "Show changes" shows its `D` only on a fine pointer outside the phone layout.
- **Save to My mazes is in the ⋯ menu** (owner, 14/10), so the title keeps the island's width on a phone; it is not
  offered while editing on a phone, since the first edit saves anyway. A mouse has no view mode, so a notebook keeps it.
  It is offered for any maze not in My mazes but a blank new one (#29), and keeps the maze's own name, origin and
  recipe (owner, 29/10): "<name> (edited)" is only the name of the copy a real first edit makes.

## Sharing and files

- **Copy link** puts `#/m/<code>` on the clipboard, falling back to `execCommand('copy')` and then the address bar; a
  toast says when the text after the grid is left out. Share… uses Web Share where the browser has it.
- **Opened `.txt` files are refused over 1 MiB.**
- **Several mazes of My mazes are deleted by selecting** (owner, 14/10): a press held 500 ms starts it, only on My
  mazes; the bar's Delete goes through the same delete as the ⋯ menu's, for a list of ids.
- **Rename** refuses a name already in My mazes, without case. Menus close without an exit animation, and downloads
  and Share… start once the menu has closed, so nothing eats the next click.
- **Toasts** last 2.4 s, and 8 s when they carry an action, so its button can be reached; Radix pauses them on hover
  and focus. The new version's toast stays until Reload or its close button.

## The embed

- **Any frame gets the embed** (owner, 15/10): `src/main.tsx` takes `?embed` or `window.top !== window`. A frame
  made without `?embed` still shows the maze, and no site can frame the editor to clickjack My mazes.
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
- **Only the repository and links.** My mazes live in the visitor's own browser, so a page of
  another site naming one would show whatever that visitor keeps, or nothing; the embed refuses them, and the
  library, with a sentence. A repository maze comes from the built-in snapshot; one the snapshot lacks, such as a maze
  added to mazefiles after this build, is read from GitHub with one request to `raw.githubusercontent.com` (path
  checked, a file over 1 MiB refused, 10 s at most, no storage, no API call), because the embed has no updater and the weekly bump of the
  submodule would leave a new maze reading "No maze at that path" for days. A failed request says so as before.
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
- **The board's focus shows as the cell cursor, not a ring** (owner, 15/10). A white ring around the whole board read
  as a bug, above all when a programmatic focus after a key made Chrome treat a click's focus as `:focus-visible`. The
  canvas has no ring; when the keyboard focuses it, the cursor shows at once. A press on the board with the quick list
  open lets the press itself focus the board, so it never comes as a keyboard focus.
- **axe fails on every impact**, minor ones included, and runs after `settled()`, two quiet frames.
- **Safe areas.** Fixed islands and toasts sit off the notch through the `*-safe-*` utilities;
  `tests/config/safe-areas.test.ts` fails a fixed element by an edge without one. The grid's insets do not add them.
- **"Mine" reads "My mazes"** everywhere the user reads it; code names stay `mine`.
- **English only**: counts stay as written, without `Intl.NumberFormat`. Names, paths and commits shown are
  `translate="no"`.

## The generator

- **A port of the mockup, not a redesign.** `src/generator` is the generator of the mockup in the Micras workspace
  (`docs/maze-editor/mockups/generator/assets/`, version 7), typed, with its structure and names: it builds the same
  walls from the same seed, which `tests/generator/mockup-cross-check.ts` checks against the mockup itself. The
  measuring and calibration scripts stay in the mockup.
- **Seeds verify on every engine.** A recipe carries `wallHash` of the walls it made under `GENERATOR_VERSION`;
  decisions use `+ - × /` and `Math.sqrt`, never `Math.pow`, `exp`, `log`, `atan2`, `hypot` or `**`, which engines
  round differently, and a test reads the sources for them. A change that moves any seed's walls bumps the version and
  records new golden hashes beside the old ones, never over them.
- **Only the UI imports it**, so it stays out of the first screen: the fence of `src/main.tsx` refuses it, and the UI
  loads it on demand. Its presets carry English copy only, as the app does.
- **Generate is part of New maze, marked Beta** (owner, 18/10 and 21/10): New maze → Generate… → settings and
  candidates → Use this opens the maze in the editor as a new maze, written to My mazes at once with its recipe
  (#29), as its first edit would; Use this that replaces the board, a saved generated maze's too, is a step of undo
  like any edit (owner, 29/10). No screen of its own. The presets are back, Recommended first, with Custom (from …)
  and a reset once a field moves; every target the generator aims at is a field, the rarer ones under Fine tuning. The
  form is the mockup's
  (`docs/maze-editor/mockups/generator/assets/settings-form.js`) in React, its logic without React in
  `settings-model.ts`, its English copy only.
- **Loaded when Generate first opens.** The dialog and the generator are one lazy chunk (about 28 KB gzip) and the
  worker another (about 23 KB); the first screen gains about 4 KB gzip (207.9 to about 211.7 KB): the menu items, five
  icons, the classes the dialog adds to the one stylesheet, the recipe in My mazes and the editor's preview. Radix's
  switch is left out of the `radix` chunk group, which the first screen loads, since only the dialog uses it. A chunk
  that fails to load says so in a toast and closes the dialog.
- **A pool of workers, one maze per message.** Up to four workers, one fewer than the cores, share a queue of the
  batch's 8 seeds in a row, and each maze shows in its seed's card as soon as it is built, so the cards stay in seed
  order and the same settings and first seed show the same mazes on every computer; 8 more goes on from the next seed.
  No hidden pool (owner, 24/10): building three seeds per card and keeping the most varied skewed the calibrated mix
  toward outliers and style bonuses, tripled the time on a phone and read as "24" built for 8 shown. The varied pick
  (`pickDiverse`, `pickBatch`) stays in the core for a later "More like this". A maze off its targets carries a
  warning that names what it missed, worked out in the worker from the generator's `report` and `choiceMisses`
  against its seed's targets, which only the worker has. A new run, closing the panel and leaving the editor (which
  closes it) terminate the workers; there is no Cancel (owner, 25/10): a batch of 8 takes seconds, and Generate
  asked again during a run starts over, while 8 more and › wait for the run to end.
- **One last batch for the app, for the session** (owner, 30/10, #30). Every Generate dialog, the library's and the
  editor's, shows the same batch, held in memory only: a reload forgets it. Opening on it shows the gallery, its status
  row reading "Last batch · 16 mazes" beside New batch, which builds a fresh batch with the settings now; the maze last
  picked with Use this is tagged In use on its card and in its view, and the tag moves with the next one picked. More
  goes on with the batch's own settings. Rebuild from a recipe starts a batch of its own: the rebuilt maze is #1,
  opened at once, and › past it builds the next seeds with the recipe's settings.
- **The board previews the candidate on a notebook** (owner, 24/10), as the mockup's editor did: from the editor
  the panel docks on the right without a modal backdrop, so the board stays in reach to pan and zoom, and the studio
  shows the candidate picked (or the last one built before it while it is on its way) on the board as a preview,
  the title island's line reading "Preview · seed N" instead of a chip over the maze, through its existing
  previewing state: no edit, no step of history, no tools, the ⋯ menu's edits off. Closing
  the panel puts the open maze back as it was; Use this replaces it as before. New maze → Generate… on a notebook
  opens a new blank maze of the saved settings' size with the panel open; its Use this opens the maze picked as the
  new maze, with its name and recipe, and closing leaves the blank maze unsaved, as any new maze. The panel takes
  the focus, Esc closes it, and "Back to the board" focuses the board. A phone keeps the sheet over the library or
  the editor.
- **A gallery, and a maze opened over it** (owner, 25/10). The gallery is the panel's home: a status row of fixed
  height ("Seeds 1–8", or "Building 3 of 8…") above the cards, which show a grey wave until their maze is built and
  fill in as each one is, so nothing moves while a run goes on; "8 more" ends the grid and appends. A card opens its
  maze in a view pushed over the gallery, a region named by its heading, which takes the focus: on a phone the maze
  drawn large and, under it, its title line with Copy recipe, its tags and its sentences, compact enough to fit above
  the footer; beside the editor on a notebook only the information, as the editor's board previews it, a card under
  the pointer previewing too. Only this view has the footer, ‹ Use this ›, and steps with a swipe or the arrow keys: ›
  past the last maze builds 8 more, appends them (#9 of 16) and moves to the first at once, its loading board showing
  it build; ‹ and › step onto mazes still building too, and a card still building opens. Back and Esc go back to the
  gallery where it was, focusing the card; Esc in the gallery closes the panel. On a phone the panel takes the whole
  screen. The settings are a view of their own behind a gear in the header. A batch stops at 64 mazes, which the gallery
  says in place of 8 more, and the footer's line on the last maze. A first design with a Gallery or One switch and a
  progress bar (24/10) made you scroll between a card and its details, and shifted the layout as runs started and ended.
- **Seeds over the whole 32-bit range** (owner, 24/10). The first seed and the dice draw from 0 to the largest first
  seed with `crypto.getRandomValues`: with a known preset, a range of 100,000 seeds could be built ahead of a
  contest in hours.
- **A recipe holds only for the walls it made** (owner, 24/10). An item of My mazes keeps the recipe (`recipe`:
  version, settings, seed, wall hash, and the walls and goal cells it built) as data: `src/library` cannot read the
  generator, so it checks only the shape, and the generator's `readRecipe` checks it before anything is rebuilt. The
  editing session keeps the recipe with the maze it made and shows and saves it only while the board shows that maze:
  a manual edit drops it from the item, and Undo back to the generated walls writes it again, with no state of its own
  in the history. The backup's index carries it, and an index entry with a recipe of another shape is dropped. Copy
  recipe in the editor's ⋯ menu copies it while it holds, and Rebuild from a recipe in the dialog builds it again and
  says, as the mockup does, when this generator builds other walls than it saved, or when an older generator made it.
- **Generate in the editor replaces the board** (owner, 24/10), as the mockup's panel did: Generate… in the ⋯ menu
  opens the same dialog sized to the open maze when it is 16 × 16 or 32 × 32, and says so otherwise. Use this on a
  maze of the board's size puts it on the board as one step of undo, under the same name, through the editor's own
  path, so a repository maze is copied to My mazes as by any edit; a maze of another size opens as a new maze. The
  hint "Replaces the maze on the board. Undo brings it back." is left out on a blank board.
- **The settings are kept per device in the `settings` store** of IndexedDB, instead of the
  mockup's `localStorage`: the preset and the settings of the last valid change, checked with `isSettings` when read
  back. Another tab's change is not followed while the dialog is open.
- **Loading is grey, ready is red** (owner, 28/10, the mockup's `loading/flow.html`). A card waiting for its maze shows
  a decorative maze of the batch's size (16 × 16 with its goal, one entrance; 32 × 32 with none), under a diagonal wave,
  each card's clock 537 ms after the one before; the board of the maze picked shows the routes the generator is trying,
  then from the first snapshot with half the passages of a spanning maze open the newest such snapshot, never the grid
  again after a restart. A built maze replaces it at once, the grey fading out over it in 300 ms; without motion the
  wave stands still, no route shows and the maze swaps in. The worker sends a snapshot at most every 25 ms and at each
  change of stage, with the last 8 routes tried, which costs the generation under 1 %. The painting lives in
  `src/render/loading.ts`, kept out of `src/render/index.ts`: the first screen imports that index, and a module it
  re-exports lands in a chunk the first screen loads even when only the Generate chunk uses it.

## Tests and performance

- **Four Vitest projects**: `unit` (Node), `browser` (Chromium), `performance` (outside the check, one file at a time)
  and `e2e` (the app built once under `/maze-studio/` into `node_modules/.tmp/`, never `/tmp`).
- **The frame budget of DESIGN.md 8**: p95 at most 20 ms and at most 1 % of frames over 25 ms, the median of three runs
  by share of slow frames, then worst frame, then p95. The production gate in `e2e` holds it on the built app. The
  library's gate in `performance`, on React's development build in the tester's iframe, allows 2 %: it spreads from 0
  to 1.5 % between runs on the reference notebook. The flights also allow no interval over two refreshes
  at 60 Hz (34.3 ms, `2 × 1000 / 60 + 1`): with 33 ms, CI failed on a frame of 33.3 ms, which is exactly two refreshes. A flight lasts about 45
  intervals, so one slow frame is 2.2 % of a run, and the median run failed the gate whenever two of the three runs had
  one. The production gate pools the intervals of its three runs (about 135) for the p95 and the 1 %, rounded up to
  whole frames (2 slow frames in 135). The ceiling stays on the median run.
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
  `camera-stage.tsx` (the application role), `batch-run.ts` (`Worker.postMessage` takes no origin either), and
  `no-await-in-loop` for `scripts/`, the e2e tests and the frame and
  touch helpers, which wait step by step on purpose.

## Branches, CI and previews

- **Gitflow** (owner, 15/10): features from `develop` by pull request, releases from `develop` to `main`, hotfixes from
  `main`. CI runs on pushes to both and on every pull request.
- **The weekly mazefiles bump goes to `main` and to `develop`** (owner, 15/10): two `gitsubmodule` entries in
  `dependabot.yml` that differ only by `target-branch`, so new mazes reach the site without a release. A workflow that
  syncs `develop` from `main` would need Actions to open pull requests, which the organisation does not allow. Two
  bumps do not collide: a merge compares content, and the same gitlink on both sides is no conflict. The one case is
  `develop` a bump behind `main`, when one pull request failed; the release then conflicts on `vendor/mazefiles`, and
  the newer commit is the one to keep.
- **The frame gate only reports on CI** (owner, 15/10). Shared runners are too uneven for a frame budget: one runner
  measured 38.7 ms for the 27 ms benchmark, and the gate failed on a frame or two. With `CI` set, `production-frames`
  measures, prints and writes the numbers to the job summary, and fails on nothing but a broken measurement; on a known
  machine, locally and in reviews, it blocks as before.
- **The site and the previews on Cloudflare Pages** (owner, 29/10). The site moved from
  `team-micras.github.io/maze-studio/` to `maze.micras.team`. A custom domain on GitHub Pages takes the whole site, so
  previews at `github.io/maze-studio/pr-<n>/` would have moved with it; one Pages project on Cloudflare serves `main`
  as production and each pull request as the branch `pr-<n>`, at `pr-<n>.maze-studio-8ol.pages.dev`. Each preview is
  an origin of its own, so the path checks that kept a preview's database, service worker and navigations apart from
  the site's (`src/preview.ts`) went, with `gh-pages.sh` and the cleanup workflow: Cloudflare keeps old deployments
  at no cost. The few users were told to export their mazes before the move; the old origin got no notice.
- **Previews deploy from a trusted workflow.** The pull request is built by a `pull_request` workflow with read access
  and no secret, and a `workflow_run` workflow, trusted, uploads the artifact with `wrangler pages deploy`: it checks
  that the build came from a branch of this repository and that the number the artifact gives is an open pull request
  whose head is the commit built, refuses symbolic links, `.git` entries, `_worker.js`, `_routes.json` and anything over
  50 MB, and never runs anything of the pull request. The token sits in an environment only `main` may deploy from:
  both deploys run as `main` (`push` and `workflow_run`), and a pull request's own workflow, which a branch of this
  repository may edit, gets no secret. `pages.yml` builds read only and publishes from a job that only uploads the
  artifact.
- **Previews only for branches of this repository.** A preview publishes the pull request's code under the project's
  domain, so a fork's pull request gets CI and no preview.
