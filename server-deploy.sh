#!/usr/bin/env bash
#
# Runs ON THE SERVER, inside the deployed folder. Ships on the "deploy"
# branch so it survives every reset.
#
# The deploy branch carries the backend source with the built showroom already
# in public/. Node never runs here; composer and php do.
#
#   cd /var/www/<user>/data/www/door.dbc-server.uz && bash server-deploy.sh
#
# ONE-TIME SETUP — see docs/deploy.md. In short: clone the branch, write .env,
# point the site's document root at <folder>/public.
#
# --------------------------------------------------------------------------
# WHAT THIS DELIBERATELY NEVER TOUCHES
#
#   storage/app/public/catalog   every photograph the workshop has published.
#                                They exist ONLY here — there is no other copy.
#   .env                         this server's own credentials and APP_KEY.
#
# Both are untracked, and `git reset --hard` only rewrites files git knows
# about. That is why there is no `git clean` here: `clean -fd` would delete
# exactly those two, which is the difference between a deploy and an outage
# with permanent data loss.
# --------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if [[ ! -f .env ]]; then
  echo "Error: no .env here. See docs/deploy.md — this server keeps its own." >&2
  exit 1
fi

echo "==> 1/5 Fetching the deploy branch"
git fetch origin deploy
git reset --hard origin/deploy

# Drop the caches the PREVIOUS deploy wrote. Everything below runs artisan,
# and a stale bootstrap/cache/config.php would answer with the last release's
# config — including config keys this release added and that one never had.
php artisan optimize:clear

echo "==> 2/5 Installing PHP dependencies"
composer install --no-dev --optimize-autoloader --no-interaction --prefer-dist

echo "==> 3/5 Migrating and seeding"
# Both are idempotent: migrations only run what is pending, and the seeders
# write a catalogue row only where its id is absent and never re-apply the
# bench password.
php artisan migrate --force
php artisan db:seed --force

echo "==> 4/5 Linking storage"
# Best effort. Shared hosting with symlinks disabled fails here, and the app
# is built for that: config/filesystems.php serves the public disk through
# PHP as a fallback, so images work either way.
php artisan storage:link || echo "  (no symlink — serving /storage through PHP instead)"

echo "==> 5/5 Caching config, routes and views"
php artisan config:cache
php artisan route:cache
php artisan view:cache

echo ""
echo "Deployed: $(git log -1 --format='%ci  %h')"
