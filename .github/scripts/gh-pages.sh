#!/usr/bin/env bash
# Updates the gh-pages branch, which GitHub Pages serves, from a checkout of this repository whose
# credentials can push. Run only by trusted workflows; it copies files and never runs them.
#
#   gh-pages.sh site <source>        the site at the root, keeping every pr-<n>/ preview
#   gh-pages.sh put <n> <source>     the preview of pull request <n> at pr-<n>/
#   gh-pages.sh drop <n>             removes the preview of pull request <n>
set -euo pipefail

action="$1"
work="$(mktemp -d)"

if git fetch --quiet --depth 1 origin gh-pages 2>/dev/null; then
  git worktree add --quiet --detach "$work" FETCH_HEAD
else
  git worktree add --quiet --orphan -b gh-pages-first "$work"
fi

copy() {
  if find "$1" -type l | grep -q .; then
    echo "refusing $1: it holds symbolic links" >&2
    exit 1
  fi
  cp -R "$1"/. "$2"/
}

case "$action" in
  site)
    find "$work" -mindepth 1 -maxdepth 1 ! -name .git ! -name 'pr-*' -exec rm -rf {} +
    copy "$2" "$work"
    message="🚀 Publish the site"
    ;;
  put)
    [[ "$2" =~ ^[0-9]+$ ]] || { echo "not a pull request number: $2" >&2; exit 1; }
    rm -rf "$work/pr-$2"
    mkdir -p "$work/pr-$2"
    copy "$3" "$work/pr-$2"
    message="🚀 Publish the preview of pull request #$2"
    ;;
  drop)
    [[ "$2" =~ ^[0-9]+$ ]] || { echo "not a pull request number: $2" >&2; exit 1; }
    rm -rf "$work/pr-$2"
    message="🔥 Remove the preview of pull request #$2"
    ;;
  *)
    echo "unknown action: $action" >&2
    exit 1
    ;;
esac

touch "$work/.nojekyll"
cd "$work"
git add -A

if git diff --cached --quiet; then
  echo "gh-pages already up to date"
  exit 0
fi

git -c user.name='github-actions[bot]' \
  -c user.email='41898282+github-actions[bot]@users.noreply.github.com' \
  commit --quiet -m "$message"
git push --quiet origin HEAD:refs/heads/gh-pages
