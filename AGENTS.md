# Working on maze-studio

- Read [`README.md`](README.md) and [`ARCHITECTURE.md`](ARCHITECTURE.md) first. The plan lives
  outside this repository, in `docs/maze-editor/PLAN.md` of the Micras workspace.
- Work in slices, one at a time, as the plan lists them. Each slice is implemented, reviewed
  independently (PASS or FAIL), fixed, and closed with `bun run check` green.
- Gitflow: `feature/*` branches start from `develop` and come back by pull request; a release is a
  pull request from `develop` to `main`; `hotfix/*` starts from `main`. Commit on the feature
  branch: one line, a gitmoji and a short English sentence, no body, no trailer (for example
  `✨ Parse the mazefiles text format`). Push only with the owner's ok.
- Run one browser suite at a time on the machine, and always under the lock:
  `flock /tmp/maze-studio-tests.lock bun run check` (the same for `test`, `test:e2e` and
  Playwright).
- Never write builds or large outputs to `/tmp`.
- A new dependency needs its reason written in [`decisions.md`](decisions.md), which also
  records the other choices made along the way.
- Code and docs in English. Doc comments on exported APIs; no comments inside function bodies.
- `vendor/mazefiles` is pinned, and Dependabot moves it forward every week with a pull request to
  `main` that merges itself once CI passes; `sync-develop.yml` then brings `main` back into
  `develop`. `src/library/snapshot.json` is generated from the submodule by the
  `pre` scripts and never committed. Tests of the corpus check invariants (blob SHA, byte-for-byte
  and compact-code round trips, no `error` under the folder's profile, snapshot equal to the
  submodule), never counts of one commit, so a new maze upstream needs no change here.
- On GitHub, the repository needs "Allow auto-merge" turned on, rules for `main` and `develop`
  that require CI's `check` job, and Pages served from the `gh-pages` branch; see the README.
- Reference screenshots (`tests/**/screenshots/`) are made in the Playwright image of the pinned
  version, `mcr.microsoft.com/playwright:v1.63.0`, so that they match CI and not one notebook.
  After a deliberate change of the drawing, check the disk with `df -h /` and, from the repository,
  run under the lock:

  ```sh
  flock /tmp/maze-studio-tests.lock docker run --rm --user "$(id -u):$(id -g)" \
    -e HOME=/tmp/home -v "$PWD":/work -w /work mcr.microsoft.com/playwright:v1.63.0 \
    node_modules/.bin/vitest run --project browser <test file> -u
  ```

  With rootless Docker, drop `--user`: the container's root is already your user.

  Look at the pictures before committing them.
