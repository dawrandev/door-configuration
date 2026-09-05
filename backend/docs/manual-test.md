# Qo'lda tekshirish

Avtomatik testlar ushlay olmaydigan narsalar. Har reliz oldidan.

## Katalog shakli (Faza 1 dan keyin — eng muhimi)

`GET /api/catalog` javobi toza brauzerdagi eski `mergeLeaves(BASE_LEAVES)` /
`mergeRooms(BASE_ROOMS)` / `mergeColors(BASE_COLORS)` natijasi bilan
**maydonma-maydon** teng bo'lishi shart (rasm yo'llaridan tashqari).

Bu fazani eng qattiq tekshirish kerak: keyingi har bir faza shakllar mos
kelishiga tayanadi, va Faza 5 da topilgan nomuvofiqlik qayta yozish demakdir.

## Nashr atomikligi (Faza 3)

1. Eshikni 2 ta nalichnik bilan nashr qiling → 1 leaf + 2 trim qatori.
2. Xuddi shu eshikni qayta nashr qiling → hali ham 1 + 2, dublikat yo'q.
3. Tranzaksiya o'rtasida istisno hosil qiling → bazada ham, `storage/` da ham
   hech nima o'zgarmasligi kerak. `catalog:check` toza chiqishi kerak.

## Ko'chishning haqiqiy maqsadi (Faza 5)

Verstakda eshik nashr qiling → **boshqa brauzerda** (yoki boshqa kompyuterda)
oching → o'sha eshik ko'rinishi kerak.

Butun ish shuning uchun qilinyapti. Bu ishlamasa, qolgani ahamiyatsiz.

## Rasm kesh kaliti (Faza 6)

Eshikni qayta kesib nashr qiling → showroom **yangi** rasmni ko'rsatishi kerak,
eskisini emas. Eski nomdagi fayl kesh kalitini o'zgartirmasdi; kontent-hash shu
uchun.
