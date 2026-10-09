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
- **`ragged-line`.** The line right after the grid starts with `o` or `|`, as the upstream
  `read_maze` would take for the grid, but breaks its shape; the grid may have ended early.
- **`long-trailer`.** The trailer has more than 65,535 bytes of UTF-8, counted in bytes, not
  characters. Note for slice 1c: it is a warning of its own, not part of "homogeneous grid"; and
  the check before sharing looks at the trailer itself, since the code cannot carry it.
- **A grid needs a cell line.** A line of posts alone is refused at line 2, since a maze has at
  least one cell.
- **A lone `\r` is a line break.** `\r\n` and a lone `\r` both become `\n`, and `hadCR` says so.
- **`ignoreBOM: true`.** The code's decoder keeps a leading byte order mark of the trailer or the
  name, so both come back byte for byte.
- **The remaining ambiguity.** A trailer line exactly as long as the grid's lines that starts with
  a space or `|`, followed by a line of posts of that length, reads as more grid. Only a file made
  to look like a taller maze does that; the repository has no trailer but a blank line.
- **Padding bits.** The code's decoder refuses a last wall byte whose padding bits are not zero
  (`non-canonical`), so each maze has one code.
