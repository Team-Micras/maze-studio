#!/usr/bin/env bash
# Updates the gh-pages branch, which GitHub Pages serves, from a checkout of this repository whose
# credentials can push. Run only by trusted workflows; it copies files and never runs them.
#
#   gh-pages.sh site <source>        the site at the root, keeping every pr-<n>/ preview
#   gh-pages.sh put <n> <source>     the preview of pull request <n> at pr-<n>/
#   gh-pages.sh drop <n>             removes the preview of pull request <n>
#
# The branch is only where the site is deployed from, so each update is one commit with no parent,
# pushed with a lease on the commit it was made from; when another workflow pushed in between, the
# lease fails and the update starts again from the new branch, up to five times.
set -euo pipefail

action="$1"
number="${2:-}"
source="${3:-${2:-}}"
max_bytes=$((50 * 1024 * 1024))

if [ "$action" != site ] && [[ ! "$number" =~ ^[1-9][0-9]*$ ]]; then
  echo "not a pull request number: $number" >&2
  exit 1
fi

if [ "$action" != drop ]; then
  if find "$source" -type l -o -name .git | grep -q .; then
    echo "refusing $source: it holds symbolic links or .git entries" >&2
    exit 1
  fi
  if [ "$(du -sb "$source" | cut -f1)" -gt "$max_bytes" ]; then
    echo "refusing $source: it is over 50 MB" >&2
    exit 1
  fi
fi

update() {
  local work="$1"

  case "$action" in
    site)
      find "$work" -mindepth 1 -maxdepth 1 ! -name .git ! -name 'pr-*' -exec rm -rf {} +
      cp -R "$source"/. "$work"/
      message="🚀 Publish the site"
      ;;
    put)
      rm -rf "$work/pr-$number"
      mkdir -p "$work/pr-$number"
      cp -R "$source"/. "$work/pr-$number"/
      message="🚀 Publish the preview of pull request #$number"
      ;;
    drop)
      rm -rf "$work/pr-$number"
      message="🔥 Remove the preview of pull request #$number"
      ;;
    *)
      echo "unknown action: $action" >&2
      exit 1
      ;;
  esac

  touch "$work/.nojekyll"
}

for attempt in 1 2 3 4 5; do
  work="$(mktemp -d)"

  if git fetch --quiet --depth 1 origin gh-pages 2>/dev/null; then
    lease="$(git rev-parse FETCH_HEAD)"
    git worktree add --quiet --detach "$work" FETCH_HEAD
  else
    lease=''
    git worktree add --quiet --orphan -b "gh-pages-new-$$-$attempt" "$work"
  fi

  update "$work"
  git -C "$work" add -A
  tree="$(git -C "$work" write-tree)"
  git worktree remove --force "$work"

  if [ -n "$lease" ] && [ "$tree" = "$(git rev-parse "$lease^{tree}")" ]; then
    echo "gh-pages already up to date"
    exit 0
  fi

  commit="$(git -c user.name='github-actions[bot]' \
    -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
    commit-tree "$tree" -m "$message")"

  if git push --quiet --force-with-lease="refs/heads/gh-pages:$lease" origin \
    "$commit:refs/heads/gh-pages"; then
    exit 0
  fi

  echo "gh-pages moved while updating it, attempt $attempt; starting again" >&2
done

echo "could not update gh-pages after five attempts" >&2
exit 1
