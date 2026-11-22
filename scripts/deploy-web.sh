#!/usr/bin/env bash
# Build the web app and publish it to GitHub Pages (the gh-pages branch).
#
#   npm run deploy:web
#
# The server address is baked into the build, so it must be set here.
# Override with EXPO_PUBLIC_CHAT_API_URL=... npm run deploy:web
set -euo pipefail

API_URL="${EXPO_PUBLIC_CHAT_API_URL:-https://tosdr-dashboard-server.onrender.com}"
ROOT="$(git rev-parse --show-toplevel)"
OUT="$ROOT/web-dist"
REV="$(git -C "$ROOT" rev-parse --short HEAD)"

cd "$ROOT"
echo "Building web app against $API_URL ..."
EXPO_PUBLIC_CHAT_API_URL="$API_URL" npx expo export --platform web --output-dir "$OUT"
cp "$OUT/index.html" "$OUT/404.html" # GitHub Pages serves 404.html for deep links
touch "$OUT/.nojekyll"               # keep the _expo folder (Jekyll hides _ folders)

WT="$(mktemp -d)"
git fetch -q origin gh-pages
git worktree add -q --detach "$WT" origin/gh-pages
cleanup() { git -C "$ROOT" worktree remove --force "$WT"; }
trap cleanup EXIT

git -C "$WT" rm -rq --ignore-unmatch . # drop the old build (tracked files only)
cp -R "$OUT/." "$WT/"
git -C "$WT" add -A
if git -C "$WT" diff --cached --quiet; then
  echo "Nothing changed; site already up to date."
  exit 0
fi
git -C "$WT" commit -q -m "Deploy web build $REV" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git -C "$WT" push -q origin HEAD:gh-pages
echo "Published. https://ananddharne.github.io/tosdr-dashboard/ updates in a minute or two."
