/**
 * Karakalpak / Uzbek / Russian. Not an afterthought — our customers
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
  step1: { uz: 'Xonangizni tanlang', kk: 'Bólmeńizdi saylań', ru: 'Выберите комнату' },
  step2: { uz: 'Eshigingizni tanlang', kk: 'Esikti saylań', ru: 'Выберите дверь' },
  stepnalichnik: { uz: 'Nalichnikni tanlang', kk: 'Naličnikti saylań', ru: 'Выберите наличник' },
  stepkorona: { uz: 'Koronani tanlang', kk: 'Koronanı saylań', ru: 'Выберите корону' },
  step2c: { uz: 'Eshik rangini tanlang', kk: 'Esik reńin saylań', ru: 'Выберите цвет двери' },
  sumt: { uz: "Yakuniy ko'rinish", kk: 'Juwmaqlaw', ru: 'Итог' },

  trim: { uz: 'Nalichnik va korona', kk: 'Naličnik hám korona', ru: 'Наличник и корона' },
  nalichnik: { uz: 'Nalichnik', kk: 'Naličnik', ru: 'Наличник' },
  korona: { uz: 'Korona', kk: 'Korona', ru: 'Корона' },
  trimsame: { uz: 'Eshik rangida', kk: 'Esik reńinde', ru: 'В цвет двери' },
  trimdefault: { uz: 'Standart', kk: 'Standart', ru: 'Стандартный' },
  colornote: {
    uz: 'Nalichnik va korona standart holatda eshik rangida — lekin xohlasangiz, yuqorida ularni alohida rangga o‘zgartirishingiz mumkin.',
    kk: 'Naličnik hám korona standart halda esik reńinde — biraq qáleseńiz, joqarıda olardı bólek reńge ózgertiwińiz múmkin.',
    ru: 'Наличник и корона по умолчанию в цвет двери — но вы можете выбрать для них другой цвет отдельно, выше.',
  },

  wall: { uz: 'Xona', kk: 'Bólme', ru: 'Комната' },
  model: { uz: 'Model', kk: 'Model', ru: 'Модель' },
  swipehint: {
    uz: 'Almashtirish uchun suring',
    kk: 'Almastırıw ushın sırǵıtıń',
    ru: 'Проведите, чтобы сменить',
  },
} satisfies Record<string, Tr>;

export function tr(d: Tr, lang: Lang): string {
  return d[lang] || d.uz;
}
