# Jarayon

| Faza | Holat | Izoh |
|---|---|---|
| 0 — Karkas | ✅ | Laravel 12.69.1, MySQL sozlangan, hujjatlar, Vite dev-proksi |
| 1 — Sxema + seed + o'qish API | ✅ | 5 jadval, seeder, GET /api/catalog (+version). Shakl frontend bilan **maydonma-maydon** tasdiqlandi |
| 2 — Auth | ✅ | Sessiya auth, bitta foydalanuvchi, email+IP throttle, `bench:password` |
| 3 — Yozish API + atomik nashr | ✅ | 10 marshrut, atomik nashr, o’chirish/tiklash/yashirish, admin katalogi, diagnostika, 2 buyruq |
| 4+5 — Mijoz tomonini ko'chirish | ⬜ | ⚠ bitta branch, bo'linmaydi |
| 5b — Eski localStorage'dan import | ⬜ | 5 bilan bir relizda |
| 6 — Render + rasm o'lchamlari | ⬜ | |
| 7 — Deploy | ⬜ | |

## Ochiq savollar

- Client serveri qaysi bo'ladi? Hozircha noma'lum — `dawran.dbc-server.uz` faqat
  test uchun va u yerda PHP ishlatilmaydi.
- `storage:link` symlink o'chirilgan shared hostingda ishlamaydi. Birinchi
  deploy'dagi eng ehtimolli nosozlik shu.
