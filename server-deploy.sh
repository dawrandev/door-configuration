#!/usr/bin/env bash
# Runs on the server. Ships alongside the build output on the "deploy"
# branch, so it survives every "git reset --hard".
#
# One-time setup (manual, over SSH, inside the target folder):
#   git clone -b deploy --single-branch https://github.com/dawrandev/door-configuration.git door
#
# After that, every time the "deploy" branch is updated, run this inside
# that folder (e.g. "door/"):
#   bash server-deploy.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

git fetch origin deploy
git reset --hard origin/deploy
git clean -fd

echo "Updated: $(git log -1 --format='%ci')"
