# Qarorlar

Nima tanlandi, va **nima rad etildi** — ikkinchisi muhimroq, chunki keyingi
odam aynan rad etilgan yo'lni qayta taklif qiladi.

## Laravel 12, 13 emas
`composer create-project` bugun 13.30.1 beradi, u PHP >= 8.3 talab qiladi.
12 tanlandi: `^8.2` yetarli, ya'ni deyarli har qanday hostingga tushadi, va
loyihachining boshqa 14 ta Laravel ilovasi bilan bir xil.

## MySQL, SQLite emas
Loyihachi qarori. SQLite texnik jihatdan yetarli bo'lardi (yuk yo'q), lekin
client serveriga topshirishda MySQL odatiy yo'l.

## `routes/web.php`, `api.php` emas
SPA'ni shu ilova beradi → same-origin → sessiya cookie'si ishlaydi. Sanctum ham,
CORS ham, token ham kerak emas.
**Rad etildi:** Sanctum SPA auth — bitta foydalanuvchili, same-origin ilova
uchun ortiqcha bog'liqlik va sozlama.

## Birlamchi kalit — katalog id'sining o'zi
`VARCHAR(64)`, auto-increment emas.
**Rad etildi:** surrogat `BIGINT` + `key` ustuni. Har controller'ga bitta
qo'shimcha qidiruv qo'shardi va bu hajmdagi katalogga hech nima bermasdi.

## "Edits overlay" jadvallari yo'q
Frontend'da `dc.leafedits.v1` kabi ikkinchi tortma bor edi — u **faqat** bitta
sabab uchun: generatsiya qilingan katalog kompilyatsiya qilingan konstanta, uni
o'zgartirib bo'lmasdi. Bazada bu sabab yo'q. `name`, `hidden`, `handle_side` —
oddiy ustunlar.
**Rad etildi:** ikki qatorli soya modeli (builtin qator + bench override qator,
serverda birlashtiriladi). U `dedup()` ni SQL'da qayta yozardi — ya'ni aynan shu
ko'chish o'chirmoqchi bo'lgan kodni.

## Geometriya JSON ustunda
`trim_boxes`, `corners`, `open`, `light` — JSON.
Sabab: bular render'ga to'g'ridan-to'g'ri uzatiladigan xom kirish; ular bo'yicha
filtr/join/sort qilinmaydi. Va **poligon nuqtalarining tartibi yuk ko'taradi** —
`recolor.ts` dagi `signedArea`/`windLike` ketma-ketlikka tayanadi. Normallashgan
jadvalda `ORDER BY seq` unutilsa, chizilgan shakl **jimgina** buziladi. JSON
massiv tartibini yo'qota olmaydi.
**Rad etildi:** `trim_pieces` + `trim_points` jadvallari.

## `Tr` uchun uchta ustun, JSON emas
`name_uz`, `name_kk`, `name_ru`. Tillar to'plami yopiq (`LANGS`), va `name_uz`
bo'yicha qidiriladi — indeks kerak.
**Rad etildi:** `translations` jadvali (yopiq 3 til uchun har elementga 5 qator).

## `colorIds` uchun pivot, JSON emas
Yagona haqiqiy relatsion o'q; FK maqsadi bor. `undefined = hamma rang`
konvensiyasi `color_mode='all'` + bo'sh pivot sifatida saqlanadi — shunda
**keyinroq qo'shilgan rang** ham avtomatik amal qiladi.
**Rad etildi:** JSON `color_ids` massivi — soddaroq, lekin xato id'ni aniqlab
bo'lmaydi va yangi rang mavjud eshiklarga bog'lanmaydi.

## Rasmlar multipart bilan, base64 bilan emas
Base64 +33% bayt, PHP butun satrni xotirada ushlaydi, 2–4MB xonada
`post_max_size` dan oshadi, va `UploadedFile` yo'qoladi — ya'ni `mimes:`, `max:`
validatsiyasi va `->store()` ishlamaydi.

## `derivedTrimId` o'rniga haqiqiy bog'lanish
`trim_models.owner_leaf_id` FK + `UNIQUE(owner_leaf_id, category)`. Frontend'da
bu satr ustida operatsiya edi (`a-<leafId>-<category>`); endi baza cheklovi.
