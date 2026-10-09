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
  inflates one entry at a time, reading the stream in chunks into a buffer of the declared size
  and cancelling it the moment it would overflow, so a crafted archive cannot fill the memory.
- **The export says what it left out.** `exportMine` returns `{ zip, skipped }`: an item whose
  stored code does not read cannot be written as a `.txt`, so the screen must tell the user which
  ones were left out rather than drop them silently.
- **An update stops at its first failure.** Downloads already running finish; no new one starts.
