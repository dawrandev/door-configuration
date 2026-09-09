# Ishlash qoidalari — backend

`Architecture.md` — qatlamlar va qarorlar. Bu fayl — kod yozishdagi qoidalar.

## Qat'iy

- **Yangi Composer paketi qo'shilmaydi.** Sof Laravel. Agar biror narsa uchun
  paket kerak deb o'ylasangiz — avval so'rang.
- **Eloquent faqat Repository ichida.** Controller yoki Service ichida
  `Model::where(...)` yozilmaydi.
- **Shipped migratsiya tahrirlanmaydi.** Har o'zgarish uchun yangi migratsiya.
- **JSON javob shakli `kiosk/src/catalog/types.ts` bilan bayt-ma-bayt mos.**
  Frontend tiplari haqiqat manbai; Resource ularga moslashadi, aksincha emas.
  Bu shartnoma buzilsa, showroom jimgina noto'g'ri ishlaydi.
- Kod izohlari **ingliz tilida** (frontend bilan bir xil). Hujjatlar o'zbekcha.
- `./vendor/bin/pint` har commit'dan oldin.

## Nomlash

- Jadval: ko'plik, snake_case (`leaves`, `trim_models`, `leaf_color`).
- Birlamchi kalit: **`VARCHAR(64)` — katalog id'sining o'zi**, auto-increment
  emas. Id'lar (`lattice`, `a-m1k2j3`) allaqachon ilovaning identifikatori va
  mijozning har bir tanlovida yozilgan.
- Model: `$incrementing = false; $keyType = 'string';` — buni unutish jimgina
  buzilishga olib keladi.

## Nimaga tegilmaydi

- `../kiosk/public/assets/` — bu offline pipeline'ning chiqishi va seeder'ning
  kirishi. Backend uni **o'qiydi**, hech qachon yozmaydi.
- `../kiosk/src/catalog/*.generated.ts` — `tools/leaves.mjs` va `tools/rooms.mjs`
  yozadi. Qo'lda tahrirlanmaydi.

## Test

- Har `/api/admin/*` endpoint uchun Feature test.
- Rasm fiksturalari **haqiqiy piksel** bilan — `tests/Concerns/MakesCatalogUploads`.
  `UploadedFile::fake()->image('a.jpg', 100, 100)` ikki marta chaqirilsa
  **bayt-ma-bayt bir xil** fayl beradi (o'lchandi). Har bir yo'l kontent-hash
  bo'lgani uchun ikkala fikstura bitta fayl nomiga tushadi — ya'ni "qayta nashr
  YANGI url beradi" testi noto'g'ri sababdan o'tadi. Fiksturalar rangi bilan
  farqlanadi.
- `LeafPublisher` uchun rollback testi majburiy, va invariant aniq:
  **muvaffaqiyatsiz nashr na bazani, na `storage/app/public/catalog/` ni
  o'zgartiradi.** Bu o'z-o'zidan kelib chiqmaydi: fayllar tranzaksiyadan
  **oldin** yoziladi, shuning uchun kompensatsiya qiluvchi o'chirish bor
  (`PublishesAtomically`).
- Ikkinchi rollback testi ham majburiy: yiqilish **mavjud** faylni
  o'chirmasligi. Kontent-hash tufayli bir xil piksellar bir xil yo'lga tushadi,
  va uni "yangi yozilgan" deb hisoblash muvaffaqiyatsiz qayta nashrda eshikning
  tirik rasmini yulib olardi.

## Muhit

- PHP 8.3.33, MySQL 8.0.30 (Laragon). Laravel 12, PHP `^8.2` — client serveri
  8.2 bo'lsa ham ishlaydi.
- Baza: `door_configurator`. Testlar `door_configurator_test` da — ular ham
  MySQL'da yuradi, SQLite'da emas: sxema `json` va `enum` ustunlariga tayanadi va
  ikki dvigatel ular haqida kelishmaydi (MySQL JSON obyekt kalitlarini saralaydi).
- `php artisan serve` → `http://localhost:8000`. Frontend `npm run dev` →
  `http://localhost:5173`, `/api` va `/storage` ni backend'ga proksi qiladi.
