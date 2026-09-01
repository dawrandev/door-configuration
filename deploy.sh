#!/usr/bin/env bash
# Builds the static site and force-pushes just the build output to a
# dedicated "deploy" branch.
#
# Runs on YOUR machine (npm lives here). The server never needs npm/node —
# it only pulls the "deploy" branch via plain git (HTML/JS/CSS/images +
# server-deploy.sh, no source code). That branch is a single rolling
# commit, force-pushed fresh each time, so main's history never carries
# 20MB+ build artifacts.
#
# One-time setup on the server (over SSH):
#   cd /var/www/dawran/data/www/dawran.dbc-server.uz
#   git clone -b deploy --single-branch https://github.com/dawrandev/door-configuration.git door
#
# After that, every time this script runs, on the server just run (inside
# the "door" folder):
#   bash server-deploy.sh
set -euo pipefail

BASE_PATH="/door/"           # sub-path under the domain (must end with /)
DEPLOY_BRANCH="deploy"       # branch the build output is pushed to

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: working tree has uncommitted changes. Commit first." >&2
  exit 1
fi

echo "==> 1/3 Building (base=$BASE_PATH)..."
(cd kiosk && npx tsc -b && npx vite build --base="$BASE_PATH")

echo "==> 2/3 Preparing '$DEPLOY_BRANCH' branch (build output only, no history)..."
WORKTREE="$SCRIPT_DIR/.deploy-worktree"
rm -rf "$WORKTREE"
git branch -D "$DEPLOY_BRANCH" >/dev/null 2>&1 || true
git worktree add --detach "$WORKTREE" >/dev/null
(
  cd "$WORKTREE"
  git checkout --orphan "$DEPLOY_BRANCH" >/dev/null 2>&1
  git rm -rf . -q >/dev/null 2>&1 || true
  cp -r "$SCRIPT_DIR/kiosk/dist/"* .
  cp "$SCRIPT_DIR/server-deploy.sh" .
  git add -A
  git -c user.email="deploy@local" -c user.name="deploy" commit -q -m "deploy: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  git push origin "HEAD:$DEPLOY_BRANCH" --force
)
git worktree remove --force "$WORKTREE"

echo ""
echo "==> 3/3 Done. GitHub '$DEPLOY_BRANCH' branch updated."
echo ""
echo "On the server (over SSH), run:"
echo "  cd /var/www/dawran/data/www/dawran.dbc-server.uz/door && bash server-deploy.sh"
echo "(if the 'door' folder doesn't exist yet, run the 'git clone' command from the comment above once first)"
