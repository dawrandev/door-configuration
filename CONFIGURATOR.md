# Configurator — professional darajaga (Pirnar uslubi)

> Bu fayl loyihaning yo'nalishini belgilaydi. CTO (Diyarbek) Pirnar konfiguratorini
> namuna qilib tanladi: https://www.pirnar.nl/en/front-doors/configurator/
> Maqsad — o'sha darajadagi professional konfigurator, bizning 2D foto-kompozit
> yondashuvimiz bilan (SPEC.md §5).

## 1. Ustuvorlik

1. **Konfigurator — 1-o'rinda.** Client sayt professional chiqishi shart.
2. **Admin panel** — ikkinchi. Faqat eshik rasmlarini yuklash uchun (5 ta rasm).
   Admin bo'lmasa fidelity ko'tarilmaydi, shuning uchun u konfiguratorning yordamchisi.

## 2. "Pirnar darajasi" nima degani — aniq ta'rif

Pirnarni professional qiladigan narsalar va bizda holati:

| Element | Pirnar | Bizda hozir | Kerak |
|---|---|---|---|
| Katta qahramon eshik | ✅ markazda, katta | qisman (devor ичida) | eshikni kattaroq, markazда, fokusда |
| Jonli almashtirish | ✅ bir zumda | ✅ shader tint | silliq crossfade (bor), kengaytirish |
| Silliq o'tishlar | ✅ | qisman | model/ramka almashganда fade |
| Toza premium UI | ✅ minimal, eshik hero | ✅ (dizayn tayyor) | saqlanadi |
| Kategoriyalar bo'ylab erkin harakat | ✅ (linear emas) | linear qadamlar | erkin tab (model/rang/ramka/dastak) |
| Studiya foni + real muhit | ✅ ikkalasi | faqat CSS devor | studiya foni qo'shish + real devor fotolari |
| Zoom / detal | ✅ | ❌ | eshikni yaqinlashtirish (naqsh, dastak) |
| Kun/tun, yoritish | ✅ | ❌ | keyingi bosqich (ixtiyoriy) |
| Fotorealizm | ✅ pro foto/3D | matt eshiklarда yaxshi | **toza fotolar kerak** |

## 3. Fidelity — halol gap

Fotorealizm 100% bizning kodga bog'liq emas. U **manba fotolarga** bog'liq:

- SPEC.md §5: yondashuv matt bo'yoqда ishlaydi, yaltiroqда sinadi. Bizning eshiklar matt — bu yaxshi.
- Hozirgi 5 model fotolarida: soya bor, yorug'lik notekis, ba'zi perspektiva. Shuning uchun
  ba'zi chetlarда artefakt qoladi.
- **Yechim:** admin orqali toza fotolar yuklash. Ideal foto: dead-on (to'g'ridan-to'g'ri),
  tekis diffuz yorug'lik, neytral/bir rang fon, soyasiz, to'liq eshik + ramka.
- Toza foto = professional natija. Iflos foto = artefakt. Bu fizika, kod emas.

## 4. Bosqichlar

### A. Konfigurator prezentatsiyasini ko'tarish (1-ustuvor)
- [ ] Eshikni kattaroq va markazда — hero sifatida (Pirnardek).
- [ ] Erkin kategoriya tab'lari: Model · Rang · Ramka · Ramka rangi · Dastak (linear qadam emas).
      Eshik doim ko'rinib turadi, tanlov o'zgarganда jonli yangilanadi.
- [ ] Model/ramka almashganда silliq crossfade (hozir faqat rang crossfade bor).
- [ ] Studiya foni opsiyasi (toza gradient/soft muhit) + real devor fotolari (kelganда).
- [ ] Zoom: eshikni yaqinlashtirib naqsh va dastakni ko'rish.
- [ ] Yuqori darajali soya/reveal (bor, yaxshilash).

### B. Admin panel — rasm yuklash (2-ustuvor)
- [ ] Alohida `/admin` route (parol bilan himoyalangan, oddiy).
- [ ] Eshik rasmini yuklash → avtomatik burish (agar yonboshiga tushgan bo'lsa).
- [ ] Alignment: leaf / ramka / dastak qutilarini rasm ustidа sozlash (SPEC §7).
- [ ] Brauzerда extraction: base/ao/spec/mask ni hisoblash (tools/passes.mjs → canvas port).
- [ ] Tint bilan jonli preview — natija plastmassaми yoki bo'yalgan po'latми, darhol ko'rinadi.
- [ ] Katalogга saqlash (test uchun IndexedDB yoki yuklab olish; keyin Laravel backend).
- [ ] Mavjud eshikni o'chirish / almashtirish (per-door delete).

### C. Fotolar kelganда
- [ ] User 5 ta toza rasm yuklaydi.
- [ ] Har birини admin orqali align qilib, extraction ishga tushiriladi.
- [ ] Eski (soyali) assetlar almashtiriladi.

### D. Keyin (SPEC §10 tartibida)
- [ ] Laravel + MySQL backend (katalog, narx, lead).
- [ ] Kiosk hardening (offline, idle, boot).

## 5. Stack (o'zgarmaydi)

- Frontend: TypeScript + Vite + React + PixiJS v8 + Zustand + Motion + Tailwind (SPEC §12).
- Render: 2D foto-kompozit + bitta fragment shader (tint) — SPEC §5.
- Backend (keyin): Laravel 11 + MySQL (SPEC dan chetlashish, CTO qarori).
- Admin extraction: hozir brauzer canvas; keyin Laravel + Intervention/Node.

## 6. Nima "professional" demak — qabul mezoni

Konfigurator professional deb hisoblanadi agar:
1. Eshik ishonarli ko'rinsa (bo'yalgan po'lat, plastmassa emas) — toza foto bilan.
2. Har tanlov <100ms да yangilansa, flicker/spinner bo'lmasa (SPEC §4).
3. UI eshikни fokusда tutsa, o'zi ko'zga tashlanmasa (SPEC §9).
4. Mobil/planshet/desktop — hammasida to'liq va chiroyli (✅ bajarildi).
5. Uch tilda (uz/kk/ru) ishlasa (✅).
