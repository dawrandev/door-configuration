#!/usr/bin/env bash
# Eshik konfiguratorini build qilib, alohida "deploy" branch'ga jo'natadi.
#
# Bu skript SIZNING kompyuteringizda ishga tushadi (bu yerda npm bor).
# Server tomonida npm/node umuman kerak emas — server faqat GitHub'dagi
# "deploy" branch'ni git orqali oladi (bu branch faqat build natijasi:
# HTML/JS/CSS/rasm fayllar + server-deploy.sh, hech qanday manba kod yo'q,
# va har safar ESKI TARIX TASHLAB, yangi bitta commit bilan almashtiriladi
# — shuning uchun asosiy "main" branch va uning tarixi 22MB'lik build
# fayllar bilan shishib ketmaydi).
#
# Serverda BIR MARTA (qo'lda, SSH orqali):
#   cd /var/www/dawran/data/www/dawran.dbc-server.uz
#   git clone -b deploy --single-branch https://github.com/dawrandev/door-configuration.git eshik
#
# Shundan keyin, HAR SAFAR shu skript ishlatilgach, serverda faqat shuni
# bajarasiz (SSH orqali, "eshik" papkasi ichida):
#   bash server-deploy.sh
set -euo pipefail

BASE_PATH="/eshik/"          # domenning qaysi sub-yo'lida ko'rinadi (oxirida / bilan)
DEPLOY_BRANCH="deploy"       # build natijalari jo'natiladigan alohida branch

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Xato: working tree'da saqlanmagan o'zgarishlar bor. Avval commit qiling." >&2
  exit 1
fi

echo "==> 1/3 Build qilinmoqda (base=$BASE_PATH)..."
(cd kiosk && npx tsc -b && npx vite build --base="$BASE_PATH")

echo "==> 2/3 '$DEPLOY_BRANCH' branch tayyorlanmoqda (faqat build fayllar, alohida tarix)..."
WORKTREE="$SCRIPT_DIR/.deploy-worktree"
rm -rf "$WORKTREE"
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
echo "==> 3/3 Tayyor. GitHub'dagi '$DEPLOY_BRANCH' branch yangilandi."
echo ""
echo "Serverda (SSH orqali) shuni ishga tushiring:"
echo "  cd /var/www/dawran/data/www/dawran.dbc-server.uz/eshik && bash server-deploy.sh"
echo "(agar 'eshik' papka hali yo'q bo'lsa, avval yuqoridagi comment'dagi 'git clone' buyrug'ini bir marta bajaring)"
