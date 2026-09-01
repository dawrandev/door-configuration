import type { Tr } from './types';

/**
 * The paint palette — curated, never a free picker.
 *
 * Every colour here is one the workshop can actually spray, and every one has
 * passed a visual check through the recolour pipeline (src/render/recolor.ts)
 * before it was allowed in. That is what a curated palette buys over a hex
 * picker: quality control. Pirnar, Hörmann and Jeld-Wen all do the same — a
 * fixed list anchored to real finishes.
 *
 * `oq` is special: it is the door exactly as photographed, so it carries NO
 * tint — the pipeline is skipped entirely and the original image is shown.
 */
export interface DoorColor {
  id: string;
  name: Tr;
  hex: string;
}

export const DEFAULT_COLOR = 'oq';

/** The trim's default state: "whatever the door is". Resolved at render time. */
export const TRIM_SAME = 'same';

export const COLORS: DoorColor[] = [
  { id: 'oq', name: { uz: 'Oq', kk: 'Aq', ru: 'Белый' }, hex: '#F3F1EB' },
  { id: 'krem', name: { uz: 'Krem', kk: 'Krem', ru: 'Кремовый' }, hex: '#E9DFC7' },
  { id: 'kulrang-moviy', name: { uz: 'Kulrang-moviy', kk: 'Kúl-reń moviy', ru: 'Серо-голубой' }, hex: '#C6CDD4' },
  { id: 'zaytun', name: { uz: 'Zaytun', kk: 'Zaytun', ru: 'Оливковый' }, hex: '#8E8F6F' },
  { id: 'karamel', name: { uz: 'Karamel', kk: 'Karamel', ru: 'Карамельный' }, hex: '#AC8A5E' },
  { id: 'kok', name: { uz: 'To‘q ko‘k', kk: 'Kók', ru: 'Тёмно-синий' }, hex: '#33415C' },
  { id: 'grafit', name: { uz: 'Grafit', kk: 'Grafit', ru: 'Графит' }, hex: '#3B4147' },
  { id: 'qora', name: { uz: 'Qora', kk: 'Qara', ru: 'Чёрный' }, hex: '#232326' },
];

/**
 * Both take the live (built-in + bench-added) list as an optional second
 * argument, defaulting to the static built-ins for callers with no store to
 * hand — a component reading live state must pass `useKiosk((s) => s.colors)`
 * or a bench-registered colour will resolve to nothing.
 */
export const colorById = (id: string, colors: DoorColor[] = COLORS): DoorColor => colors.find((c) => c.id === id) ?? colors[0];

/** sRGB 0..1 per channel — the exact space the passes live in (see recolor.ts). */
export type Tint = [number, number, number];

/**
 * The tint for a colour id, or null when the door should stay as photographed.
 * Null short-circuits the whole pipeline: no passes, no composite, no cost.
 */
export function tintFor(id: string, colors: DoorColor[] = COLORS): Tint | null {
  if (id === DEFAULT_COLOR) return null;
  const hex = colorById(id, colors).hex;
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}
