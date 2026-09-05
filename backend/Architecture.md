# Backend arxitekturasi

Bu — eshik konfiguratorining backend'i. U ikki ish qiladi: katalogni saqlaydi va
`kiosk/` SPA'siga beradi.

Qatlamlar `D:\laragon\www\DBC-CRM\Architecture.md` dagi uslubga amal qiladi.

## 1. Falsafa

- Controller yupqa. Faqat: FormRequest → Service → javob. Ichida DB so'rovi ham,
  biznes `if` sharti ham YO'Q.
- Har qatlam bitta vazifa uchun javobgar:
  - **FormRequest** — kirish to'g'rimi?
  - **DTO** (`app/Data`) — Controller'dan Service'ga qanday shaklda o'tadi?
  - **Service** — biznes qoidasi, `DB::transaction`, fayl saqlash.
  - **Repository** — faqat DB so'rovlari. Eloquent shu yerda qoladi.
  - **Model** — ma'lumot va munosabatlar.
  - **Resource** (`app/Http/Resources`) — JSON javobning shakli.
- **Sun'iy abstraksiya yasamang.** Bu yerda 4 ta resurs bor (door / room / trim /
  color) va ular o'xshash, lekin bir xil emas — `BaseRepository` yasash foyda
  bermaydi. Aniq klasslar yoziladi.
- Yangi Composer paketi qo'shilmaydi. Sof Laravel yetarli.

## 2. Bitta so'rov qanday yuradi

```
HTTP → routes/web.php  ('/api' prefiksi, 'web' middleware guruhi ichida)
   │
   ▼
Controller::method(FormRequest $request)
   │      └─ FormRequest: validatsiya
   ▼
Data\XxxData::fromRequest($request)      ← massiv emas, tipli obyekt
   │
   ▼
Services\XxxService                      ← biznes qoida, tranzaksiya, fayl
   │
   ▼
Repositories\XxxRepository               ← FAQAT shu yerda Eloquent
   │
   ▼
Models\Xxx
   │
   ▼
Http\Resources\XxxResource               ← kiosk/src/catalog/types.ts shakli
```

## 3. Nega `api.php` yo'q

SPA'ni **shu ilovaning o'zi** beradi (`public/` ichidan). Ya'ni sessiya cookie'si
same-origin. Bu:

- CORS'ni butunlay olib tashlaydi,
- token saqlashni va XSS orqali o'qiladigan bearer tokenni olib tashlaydi,
- DBC-CRM bilan bir xil (u yerda ham `api.php` yo'q, Sanctum yo'q).

Marshrutlar `routes/web.php` da `/api` prefiksi bilan, `web` guruhi ichida —
ya'ni CSRF ishlaydi. SPA `XSRF-TOKEN` cookie'sini o'qib, `X-XSRF-TOKEN`
sarlavhasida qaytaradi. `419` = sessiya tugagan → verstak login ekraniga tushadi.

## 4. Same-origin — qulaylik emas, to'g'rilik sharti

`kiosk/src/render/recolor.ts` har bir eshikni canvas'ga chizib, `getImageData`
bilan o'qiydi. **Canvas'ga boshqa origin'dan rasm chizilsa, u "tainted" bo'ladi
va har bir o'qish `SecurityError` bilan yiqiladi.**

Shuning uchun `/storage` ham, SPA ham bitta origin'dan berilishi shart. Dev'da
Vite proksi qiladi (`kiosk/vite.config.ts`), CORS yoqilmaydi — CORS bu bugni
deploy'gacha yashirib turardi.

## 5. Rasmlar — diskda, bazada emas

Fotolar `storage/app/public/catalog/{leaves,rooms,trims}/{id}/` da fayl sifatida.
Bazada faqat yo'l.

Fayl nomlari **kontent-hash bilan** (`image-9f3ab21c.jpg`). Bu ixtiyoriy emas:
`recolor.ts` ning kesh kaliti manba satriga tayanadi, va o'zgarmas nomdagi fayl
qayta kesilgan eshikni abadiy eski rangida ko'rsatardi. Hash tufayli
`/storage/catalog/*` ni `Cache-Control: immutable` bilan berish ham xavfsiz.

## 6. Nashr atomik

Eshikni nashr qilish — bitta `POST /api/admin/leaves`: leaf + 0..2 nalichnik/korona.

`LeafPublisher` service:
1. FormRequest hammasini tekshiradi — bitta bayt diskka tegmasdan.
2. Fayllar `storage/app/public/catalog/tmp/<uuid>/` ga yoziladi.
3. `DB::transaction` — qatorlar yoziladi.
4. Commit'dan **keyin** fayllar yakuniy joyga `rename` qilinadi.
5. Istisno bo'lsa — tranzaksiya qaytadi, `finally` tmp'ni o'chiradi.

Fayllar SQL tranzaksiyasiga qo'shila olmaydi, shuning uchun qoldiq xavf bor:
commit bilan rename orasidagi crash qatorlarni tmp'dagi fayllarga ishora qilib
qoldiradi. `catalog:sweep-tmp` eski tmp'larni tozalaydi, `catalog:check` esa
fayli yo'q qatorlarni topadi — **qolgan tmp fayl ko'rinmaydi, yo'q rasm esa
ko'rinadi**, shuning uchun u aniqlanadigan bo'lishi kerak.

## 7. Papka tuzilishi

```
app/
├── Data/                  DTO'lar
├── Enums/                 TrimRole, TrimCategory, Origin
├── Http/
│   ├── Controllers/
│   │   ├── Api/           katalog (ochiq)
│   │   ├── Api/Admin/     verstak (auth ortida)
│   │   └── Api/AuthController.php
│   ├── Requests/
│   └── Resources/         types.ts shakllarini aynan qaytaradi
├── Models/                Leaf, Room, TrimModel, DoorColor, User
├── Repositories/
├── Services/
└── Support/
database/
├── migrations/
└── seeders/
    ├── CatalogSeeder.php
    └── data/*.json        kiosk katalogidan bir marta eksport qilingan
```
