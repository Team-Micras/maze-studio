# Working on maze-studio

- Read [`README.md`](README.md) and [`ARCHITECTURE.md`](ARCHITECTURE.md) first. The plan lives
  outside this repository, in `docs/maze-editor/PLAN.md` of the Micras workspace.
- Work in slices, one at a time, as the plan lists them. Each slice is implemented, reviewed
  independently (PASS or FAIL), fixed, and closed with `bun run check` green.
- Commit locally on `main`: one line, a gitmoji and a short English sentence, no body, no trailer
  (for example `✨ Parse the mazefiles text format`). Never push without the owner's explicit ok.
- Run one browser suite at a time on the machine, and always under the lock:
  `flock /tmp/maze-studio-tests.lock bun run check` (the same for `test`, `test:e2e` and
  Playwright).
- Never write builds or large outputs to `/tmp`.
- A new dependency needs its reason written in [`decisions.md`](decisions.md), which also
  records the other choices made along the way.
- Code and docs in English. Doc comments on exported APIs; no comments inside function bodies.
- `vendor/mazefiles` is pinned; update it only on purpose, together with the snapshot. From slice 2
  on, the test that compares `src/library/snapshot.json` with the submodule (path, git blob SHA and
  compact code of every file) is the anchor of that hash: the snapshot, the library and the
  format's round-trip tests all trust the commit the submodule pins, and that test is what fails
  when the two drift apart.
- Reference screenshots (`tests/**/screenshots/`) are made in the Playwright image of the pinned
  version, `mcr.microsoft.com/playwright:v1.63.0`, so that they match CI and not one notebook.
  After a deliberate change of the drawing, check the disk with `df -h /` and, from the repository,
  run under the lock:

  ```sh
  flock /tmp/maze-studio-tests.lock docker run --rm --user "$(id -u):$(id -g)" \
    -e HOME=/tmp/home -v "$PWD":/work -w /work mcr.microsoft.com/playwright:v1.63.0 \
    node_modules/.bin/vitest run --project browser <test file> -u
  ```

  Look at the pictures before committing them.
