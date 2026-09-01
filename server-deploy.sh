#!/usr/bin/env bash
# Serverda ishga tushiriladigan skript. Bu fayl "deploy" branch bilan birga
# keladi (build natijasi qatorida), shuning uchun har "git reset --hard"dan
# keyin ham joyida qoladi.
#
# Birinchi marta (bir martalik, qo'lda, serverda mos papka ichida):
#   git clone -b deploy --single-branch https://github.com/dawrandev/door-configuration.git eshik
#
# Shundan keyin, har safar loyihada o'zgarish bo'lib, u qayta push qilinganda,
# shu papka ichida (masalan "eshik/") shuni ishga tushirasiz:
#   bash server-deploy.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

git fetch origin deploy
git reset --hard origin/deploy
git clean -fd

echo "Yangilandi: $(git log -1 --format='%ci')"
