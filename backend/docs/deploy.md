# Deploy

Ilova **bitta origin**dan beriladi: Laravel SPA'ni ham, `/api` ni ham,
`/storage` ni ham o'zi qaytaradi. Bu qulaylik emas — `recolor.ts` har bir
eshikni canvas'ga chizib `getImageData` bilan qayta o'qiydi, va boshqa
origin'dan chizilgan canvas "tainted" bo'lib, har bir o'qish yiqiladi
(`Architecture.md` §4). Shuning uchun ilova **subdomen ildizida** turadi,
sub-yo'lda emas.

## Bir marta: lokal mashinada

**Eng birinchi shu bajariladi.** `deploy` branch hozir eski statik saytni
saqlab turibdi — quyidagi buyruq uni to'liq ilovaga almashtiradi. Server
undan klon qiladi, ya'ni tartib muhim:

```
bash deploy.sh
```

## Bir marta: server tayyorlash (FastPanel)

1. **Subdomen yarating** — masalan `door.dbc-server.uz`.
2. **PHP 8.2+** ni shu sayt uchun yoqing. Kerakli kengaytmalar Laravel 12
   standarti: `pdo_mysql`, `mbstring`, `openssl`, `tokenizer`, `xml`,
   `ctype`, `json`, `fileinfo`, `curl`.
3. **MySQL bazasi** va foydalanuvchi yarating.
4. **Kodni oling** (deploy branch — unda backend manbasi va qurilgan
   showroom `public/` ichida turadi):

   ```
   cd /var/www/<user>/data/www
   git clone -b deploy --single-branch \
     https://github.com/dawrandev/door-configuration.git door.dbc-server.uz
   ```

   Repo yopiq (private) bo'lsa klon parol so'raydi — GitHub'da Personal
   Access Token yasab, parol o'rniga shuni bering.

5. **`.env` yozing** (`.env.example` dan nusxa oling) va shularni to'g'irlang:

   ```
   APP_ENV=production
   APP_DEBUG=false
   APP_URL=https://door.dbc-server.uz

   DB_DATABASE=<baza>
   DB_USERNAME=<foydalanuvchi>
   DB_PASSWORD=<parol>

   ADMIN_EMAIL=<verstak email>
   ADMIN_PASSWORD=<boshlang'ich parol>
   ```

   So'ng: `php artisan key:generate`

6. **Document root** ni `.../door.dbc-server.uz/public` ga qarating.
   Bu majburiy: ildizga qaratilsa `.env` va butun manba internetdan
   o'qiladi.
7. **Birinchi deploy:** `bash server-deploy.sh`
8. **Verstak parolini almashtiring:** `php artisan bench:password`

## Har safar

Lokal mashinada:

```
bash deploy.sh
```

Serverda:

```
cd /var/www/<user>/data/www/door.dbc-server.uz && bash server-deploy.sh
```

Bu asosiy yo'l. `.github/workflows/deploy.yml` xuddi shu ikkalasini `main` ga
push qilinganda o'zi bajaradi — lekin u to'rtta GitHub secret qo'yilmaguncha
oxirgi qadamda to'xtaydi (pastda). Secret'lar yo'q bo'lsa ham `deploy` branch
yangilanadi, ya'ni serverda `bash server-deploy.sh` ni qo'lda bajarish
yetarli.

## Ixtiyoriy: deploy'ni GitHub bajarsin

`.github/workflows/deploy.yml` allaqachon yozilgan. Ishlashi uchun faqat
serverga kirish kaliti kerak.

**Serverda**, deploy foydalanuvchisi nomidan:

```
ssh-keygen -t ed25519 -f ~/.ssh/gh_deploy -N ''
cat ~/.ssh/gh_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
cat ~/.ssh/gh_deploy          # MAXFIY kalit — to'liq matnini ko'chirib oling
```

**GitHub'da:** repo → *Settings* → *Secrets and variables* → *Actions* →
*New repository secret*. To'rttasi:

| Nom | Qiymat |
|---|---|
| `SSH_HOST` | server IP yoki hostname |
| `SSH_USER` | yuqoridagi kalit tegishli foydalanuvchi |
| `SSH_KEY` | `~/.ssh/gh_deploy` ning **to'liq** matni (`-----BEGIN` dan `-----END` gacha) |
| `DEPLOY_PATH` | `/var/www/<user>/data/www/door.dbc-server.uz` |

Ixtiyoriy: `SSH_PORT` (22 emas bo'lsa), `SSH_KNOWN_HOSTS` (host kalitini
qotirish uchun; qo'yilmasa birinchi ulanishda serverning kalitiga ishoniladi).

Shundan keyin `main` ga har push — va **jonli saytga deploy**. Natijani
repo'ning *Actions* tabida ko'rasiz. Qo'lda ishga tushirish ham bor:
*Actions* → *Build & Deploy* → *Run workflow*.

## Nima hech qachon o'chirilmaydi

`server-deploy.sh` da **`git clean` yo'q**, va bu ataylab:

- `storage/app/public/catalog` — ustaxona nashr qilgan **barcha suratlar**.
  Ularning boshqa nusxasi yo'q.
- `.env` — shu serverning maxfiy ma'lumotlari va `APP_KEY`.

Ikkalasi ham git kuzatmaydigan fayllar, `git reset --hard` esa faqat git
biladigan fayllarni qayta yozadi. `git clean -fd` qo'shilsa — bu deploy emas,
qaytarib bo'lmaydigan ma'lumot yo'qotish bo'ladi.

## Tekshirish

Deploy'dan keyin:

```
php artisan catalog:check        # har bir qator ishora qilgan fayl joyidami
```

Brauzerda: showroom ochilsin, eshik rangini o'zgartiring. Rang o'zgarsa
same-origin ishlayapti (aks holda canvas "tainted" bo'lib rang umuman
o'zgarmaydi).

## Agar sayt sof nginx bo'lsa

FastPanel odatda nginx + apache beradi, u holda `public/.htaccess` ishlaydi
va boshqa hech nima kerak emas. Sayt faqat nginx + PHP-FPM bo'lsa, `location`
blokiga shu qo'shilsin — aks holda `/api/...` va SPA yo'llari 404 qaytaradi:

```nginx
location / {
    try_files $uri $uri/ /index.php?$query_string;
}
```

## Ma'lum nozik joylar

- **`storage:link`** symlink o'chirilgan hostingda yiqiladi. Ilova bunga
  tayyor: `config/filesystems.php` da `'serve' => true`, ya'ni `/storage`
  PHP orqali beriladi. Sekinroq, lekin ishlaydi.
- **Sub-yo'l ishlamaydi.** SPA `/api/...` ga mutlaq murojaat qiladi, ya'ni
  ilova `https://domen/door/` ostida tursa API topilmaydi. Subdomen yoki
  domen ildizi kerak.
