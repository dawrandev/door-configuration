# Xona rasmlari uchun topshiriq (AI generatsiya)

Konfigurator uchun xona rasmlari **eshiksiz** bo'lishi shart — eshikni biz joylaymiz.
Bu hujjat AI'ga beriladigan aniq topshiriq va tanlash mezonlarini o'z ichiga oladi.

---

## 1. Nega eshiksiz

Xonada eshik bo'lsa, uning ustiga boshqa eshik qo'yganimizda asl eshikning oq cheti
sizib chiqadi — bu loyihada bizni uzoq qiynagan "oq halo" muammosi.

Teshik **bo'sh** bo'lsa, eshik cheti bir necha piksel to'g'ri kelmasa ham ortida
**qorong'ilik** ko'rinadi, ya'ni tabiiy soya tirqishi. Xato ko'rinmaydi.

---

## 2. Prompt — shuni ko'chirib ishlating

> Photorealistic interior architectural visualization, portrait orientation.
>
> A **cased opening** in the far wall — a doorway framed with white painted
> architrave and casing, **with NO door leaf installed**. The opening is empty
> and leads into an unlit space, so it reads as a dark rectangle. There is no
> door, no door slab, no glass, nothing filling the opening.
>
> Camera is **perpendicular to the wall, dead-on, at chest height**, so the
> opening is a true upright rectangle with no keystone and no converging
> verticals. The opening is centred horizontally and its proportion is
> approximately **1 : 2.5 (width : height)**.
>
> Elegant modern interior: warm neutral palette, matte painted walls, white
> skirting board, light oak or herringbone wood floor. Soft even daylight from
> the side, no harsh shadows falling across the opening. Tastefully styled with a
> few pieces of furniture and greenery near the edges of the frame, but the area
> immediately around the opening stays clear.
>
> High detail, natural materials, architectural photography lighting, 8k.
>
> Negative: door, door slab, door panel, closed door, open door, people, text,
> watermark, logo, fisheye, wide angle distortion, tilted camera, clutter in
> front of the opening.

**Muhim:** `cased opening` — bu arxitektura atamasi, "eshiksiz eshik o'rni"
degani. AI shu atamani yaxshi tushunadi. "Empty doorway" ham qo'shildi, chunki
modellar baribir eshik chizishga urinadi.

### Sozlamalar
- **Nisbat (aspect ratio): 3:4** (portret). Bizdagi xonalar 1600×2132 — aynan shu.
- Iloji boricha **eng katta o'lcham**.
- Bir promptdan **kamida 6-8 ta** variant chiqaring — yaroqlisi 1-2 tasi bo'ladi.

---

## 3. Tanlash mezonlari

Chiqqan rasmni shu ro'yxat bo'yicha tekshiring. **Har bandi majburiy:**

| ✔ | Mezon |
|---|---|
| 1 | Teshikda **eshik yo'q** — bo'sh, qorong'i |
| 2 | Teshik **to'g'ri to'rtburchak** — yon chiziqlari tik, tepasi gorizontal |
| 3 | Kamera **to'g'ri qaragan** — devor tekis, burchak ostida emas |
| 4 | Teshik atrofida **oq nalichnik** bor va **butun** (uzilmagan) |
| 5 | Teshik oldida **hech narsa turmagan** (gul, stul, gilam cheti) |
| 6 | Teshik nisbati **taxminan 1:2.5** — juda keng yoki juda tor emas |
| 7 | Yorug'lik **yumshoq** — teshik ustiga keskin soya tushmagan |
| 8 | Pol va plintus **teshik tagigacha** to'g'ri davom etadi |

**Kichik nuqson kechiriladi:** teshik biroz qiyshiq bo'lsa, men uni kod bilan
to'g'irlayman (homografiya). Lekin 2 va 3-bandlar juda buzilgan bo'lsa, tuzatib
bo'lmaydi.

---

## 4. Uslub variantlari (keyingi bosqich uchun)

Bitta xona ma'qul chiqqach, qolganlarini shu promptning **faqat uslub qismini**
o'zgartirib chiqaramiz. Maqsad — mijoz o'z uyiga o'xshaganini topsin:

1. **Yorug' zamonaviy** — oq/krem devor, och eman pol *(bazaviy)*
2. **Iliq klassik** — bej devor, molding panellar, yelkabosh pol
3. **To'q zamonaviy** — grafit/to'q kulrang devor, qora plintus
4. **Neytral minimalist** — kulrang-oq devor, mikrotsement pol
5. **Iliq yog'och** — yong'oq panel devor, iliq yorug'lik
6. **Yashash xonasi** — divan, kitob javoni ko'rinadigan kengroq kadr

---

## 5. Fayl nomi va joylashuvi

Tanlangan rasmlarni shu nom bilan saqlang:

```
kiosk/public/assets/scene/room-01-light.jpg
kiosk/public/assets/scene/room-02-classic.jpg
...
```

Keyin `#/admin/kesish` da **TESHIK** ni o'lchaysiz — ESHIK kerak emas, chunki
xonada eshik yo'q.

---

## 6. Agar AI eshiksiz teshik chiza olmasa

Zaxira yo'l bor va u ham ishlaydi: xonani **eshigi bilan** chiqaramiz, keyin men
eshik joyini kod bilan qorong'i qilaman — aynan `pilot/room-empty.jpg` da
qilganimdek. Natija bir xil.

Ya'ni **bu topshiriq muvaffaqiyatsiz bo'lsa ham loyiha to'xtamaydi.**
