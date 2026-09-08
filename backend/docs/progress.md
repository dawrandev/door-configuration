# Jarayon

| Faza | Holat | Izoh |
|---|---|---|
| 0 — Karkas | ✅ | Laravel 12.69.1, MySQL sozlangan, hujjatlar, Vite dev-proksi |
| 1 — Sxema + seed + o'qish API | ✅ | 5 jadval, seeder, GET /api/catalog (+version). Shakl frontend bilan **maydonma-maydon** tasdiqlandi |
| 2 — Auth | ✅ | Sessiya auth, bitta foydalanuvchi, email+IP throttle, `bench:password` |
| 3 — Yozish API + atomik nashr | ✅ | 10 marshrut, atomik nashr, o’chirish/tiklash/yashirish, admin katalogi, diagnostika, 2 buyruq |
| 4+5 — Mijoz tomonini ko'chirish | ✅ | Showroom ham, verstak ham API'da. Toza brauzerda (localStorage bo'sh) nashr qilingan eshik ko'rinadi — hujjatdagi asosiy mezon |
| 5b — Eski localStorage'dan import | ✅ | Verstakdagi tugma, faqat eski tortmalar bor brauzerda ko'rinadi; eskisi o'chirilmaydi, ikkinchi marta ishlamaydi |
| 6 — Render + rasm o'lchamlari | ✅ | Kesh kaliti manba uzunligiga emas, manbaning o'ziga bog'landi; `/storage/catalog/*` bir yil `immutable` |
| 7 — Deploy | ⬜ | |

## Ko'chishdan keyin

- `kiosk/src/admin/adminStore.ts` o'chirildi — hech kim o'qimaydi.
- `kiosk/src/catalog/*.generated.ts` faqat seeder'ning kirishi bo'lib qoldi;
  ilova ularni endi import qilmaydi.
- Eski localStorage tortmalari **o'chirilmaydi**. Import tugmasi bosilgach
  `dc.imported.v1` yoziladi va tugma qaytib chiqmaydi.

## Ochiq savollar

- Client serveri qaysi bo'ladi? Hozircha noma'lum — `dawran.dbc-server.uz` faqat
  test uchun va u yerda PHP ishlatilmaydi.
- `storage:link` symlink o'chirilgan shared hostingda ishlamaydi. Birinchi
  deploy'dagi eng ehtimolli nosozlik shu.
