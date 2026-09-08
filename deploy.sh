#!/usr/bin/env bash
#
# Builds the showroom and publishes a deployable tree to the "deploy" branch.
#
# Runs on YOUR machine (npm lives here). The server never needs Node: the
# branch carries the backend source with the built showroom already inside
# public/, so the server only runs composer and artisan.
#
# main therefore never carries build artifacts, and the deploy branch is a
# single rolling commit, force-pushed fresh each time.
#
# NOTE: this is the MANUAL fallback. .github/workflows/deploy.yml does the same
# on every push to main.
#
# One-time server setup: docs/deploy.md
set -euo pipefail

DEPLOY_BRANCH="deploy"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: working tree has uncommitted changes. Commit first." >&2
  exit 1
fi

echo "==> 1/3 Building the showroom"
# base=/ because the app is served from the root of its own subdomain, with
# the document root pointing at backend/public. A sub-path would also need the
# API base to move, since the SPA addresses /api absolutely.
(cd kiosk && npx tsc -b && MSYS_NO_PATHCONV=1 npx vite build --base=/)

echo "==> 2/3 Assembling the '$DEPLOY_BRANCH' branch"
OUT="$SCRIPT_DIR/.deploy-out"
rm -rf "$OUT"
mkdir -p "$OUT"

# The backend as git has it — no vendor, no .env, no local storage contents.
git archive HEAD backend | tar -x -C "$OUT" --strip-components=1
cp -r kiosk/dist/. "$OUT/public/"
cp server-deploy.sh "$OUT/"

(
  cd "$OUT"
  git init -q -b "$DEPLOY_BRANCH"
  git config user.email "deploy@local"
  git config user.name "deploy"
  git add -A
  git commit -qm "deploy: $(git -C "$SCRIPT_DIR" rev-parse --short HEAD) ($(date -u +%Y-%m-%dT%H:%M:%SZ))"
  git push -q --force "$(git -C "$SCRIPT_DIR" remote get-url origin)" "HEAD:$DEPLOY_BRANCH"
)
rm -rf "$OUT"

echo ""
echo "==> 3/3 Done. On the server:"
echo "  cd <deploy folder> && bash server-deploy.sh"
