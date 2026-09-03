/**
 * Karakalpak / Uzbek / Russian. SPEC §8: not an afterthought — our customers
 * are not one language group. Translations carried over from the approved design.
 */

export const LANGS = ['uz', 'kk', 'ru'] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_NAME: Record<Lang, string> = {
  uz: "O'zbekcha",
  kk: 'Qaraqalpaqsha',
  ru: 'Русский',
};

type Tr = Record<Lang, string>;

export const T = {
  som: { uz: "so'm", kk: 'sum', ru: 'сум' },

  brandkicker: {
    uz: 'Qoraqalpoq eshik ustaxonasi',
    kk: 'Qaraqalpaq esik ustaxanası',
    ru: 'Каракалпакская мастерская дверей',
  },
  tagline: {
    uz: "O'z eshigingizni loyihalang",
    kk: 'Óz esigińizdi jobalań',
    ru: 'Спроектируйте свою дверь',
  },
  sub: {
    uz: "Devorni tanlang, eshigingizni yarating va aniq narxini ko'ring.",
    kk: 'Diywaldı saylań, esigińizdi jasań hám anıq bahasın kóriń.',
    ru: 'Выберите стену, создайте дверь и узнайте точную цену.',
  },

  start: { uz: 'Boshlash', kk: 'Baslaw', ru: 'Начать' },
  step: { uz: 'Qadam', kk: 'Qádem', ru: 'Шаг' },
  back: { uz: 'Orqaga', kk: 'Artqa', ru: 'Назад' },
  next: { uz: 'Davom etish', kk: 'Dawam etiw', ru: 'Продолжить' },
  startover: { uz: 'Boshidan boshlash', kk: 'Qaytadan baslaw', ru: 'Начать заново' },
  getpdf: { uz: 'PDF-ni chop etish', kk: 'PDF basıp shıǵarıw', ru: 'Распечатать PDF' },
  savecta: { uz: 'Menga saqlab qo‘ying', kk: 'Maǵan saqlap qoyıń', ru: 'Сохранить для меня' },

  step1: { uz: 'Xonangizni tanlang', kk: 'Bólmeńizdi saylań', ru: 'Выберите комнату' },
  step2: { uz: 'Eshigingizni tanlang', kk: 'Esikti saylań', ru: 'Выберите дверь' },
  steptrim: { uz: 'Nalichnik va koronani tanlang', kk: 'Naličnik hám koronanı saylań', ru: 'Выберите наличник и корону' },
  step2c: { uz: 'Eshik rangini tanlang', kk: 'Esik reńin saylań', ru: 'Выберите цвет двери' },
  step3: { uz: 'Eshigingizni sozlang', kk: 'Esikti sazlań', ru: 'Настройте дверь' },
  sumt: { uz: "Yakuniy ko'rinish", kk: 'Juwmaqlaw', ru: 'Итог' },

  color: { uz: 'Rang', kk: 'Reń', ru: 'Цвет' },
  trim: { uz: 'Nalichnik va korona', kk: 'Naličnik hám korona', ru: 'Наличник и корона' },
  trimsame: { uz: 'Eshik rangida', kk: 'Esik reńinde', ru: 'В цвет двери' },
  trimdefault: { uz: 'Standart', kk: 'Standart', ru: 'Стандартный' },
  colornote: {
    uz: 'Nalichnik va korona standart holatda eshik rangida — lekin xohlasangiz, yuqorida ularni alohida rangga o‘zgartirishingiz mumkin.',
    kk: 'Naličnik hám korona standart halda esik reńinde — biraq qáleseńiz, joqarıda olardı bólek reńge ózgertiwińiz múmkin.',
    ru: 'Наличник и корона по умолчанию в цвет двери — но вы можете выбрать для них другой цвет отдельно, выше.',
  },

  finish: { uz: "Bo'yoq", kk: 'Boyaw', ru: 'Отделка' },
  pattern: { uz: 'Naqsh', kk: 'Naqıs', ru: 'Узор' },
  glass: { uz: 'Oyna', kk: 'Áynek', ru: 'Стекло' },
  handle: { uz: 'Dastak', kk: 'Tutqa', ru: 'Ручка' },
  handlefinish: { uz: 'Dastak rangi', kk: 'Tutqa reńi', ru: 'Цвет ручки' },

  wall: { uz: 'Xona', kk: 'Bólme', ru: 'Комната' },
  model: { uz: 'Model', kk: 'Model', ru: 'Модель' },
  price: { uz: 'Narx', kk: 'Bahası', ru: 'Цена' },
  estprice: { uz: 'Taxminiy narx', kk: 'Shama menen bahası', ru: 'Ориентировочная цена' },
  swipehint: {
    uz: 'Almashtirish uchun suring',
    kk: 'Almastırıw ushın sırǵıtıń',
    ru: 'Проведите, чтобы сменить',
  },
  none: { uz: "Yo'q", kk: 'Joq', ru: 'Нет' },

  /** SPEC §8 idle guard */
  stillthere: { uz: 'Shu yerdamisiz?', kk: 'Usı jerdemisiz?', ru: 'Вы ещё здесь?' },
  continue: { uz: 'Ha, davom etaman', kk: 'Awa, dawam etemen', ru: 'Да, продолжаю' },
} satisfies Record<string, Tr>;

export const CAT_NAME = {
  room: { uz: 'Xona', kk: 'Bólme', ru: 'Комната' },
  plaster: { uz: 'Shtukaturka', kk: 'Suwaq', ru: 'Штукатурка' },
  stone: { uz: 'Beton / tosh', kk: 'Beton / tas', ru: 'Бетон / камень' },
} satisfies Record<string, Tr>;

export type WallCategory = keyof typeof CAT_NAME;

export function tr(d: Tr, lang: Lang): string {
  return d[lang] || d.uz;
}

/** Prices are always shown in so'm, grouped the way our customers read them. */
export function formatPrice(n: number, lang: Lang): string {
  return `${n.toLocaleString('ru-RU')} ${tr(T.som, lang)}`;
}
