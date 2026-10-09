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
