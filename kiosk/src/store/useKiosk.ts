import { create } from 'zustand';
import { LEAVES as BASE_LEAVES } from '../catalog/leaves.generated';
import { ROOMS as BASE_ROOMS } from '../catalog/rooms.generated';
import { TRIMS as BASE_TRIMS } from '../catalog/trims.generated';
import { mergeLeaves, mergeRooms, mergeTrims, mergeColors } from '../admin/adminStore';
import type { Leaf, Room, TrimModel } from '../catalog/types';
import { COLORS as BASE_COLORS, DEFAULT_COLOR, TRIM_SAME, TRIM_DEFAULT, type DoorColor } from '../catalog/colors';
import { LANGS, type Lang } from '../i18n/strings';

/**
 * The catalogue the showroom shows: the doors, rooms, trim designs and
 * colours the pipeline prepared, plus anything a salesperson added or
 * edited at the bench. Built-ins and bench items are the same shape, so the
 * app cannot tell them apart — which is the point. Held in state, and
 * rebuilt whenever the bench changes, so a published door, room, trim
 * design or colour appears without a reload.
 */
const buildLeaves = (): Leaf[] => mergeLeaves(BASE_LEAVES);
const buildRooms = (): Room[] => mergeRooms(BASE_ROOMS);
const buildTrims = (): TrimModel[] => mergeTrims(BASE_TRIMS);
const buildColors = (): DoorColor[] => mergeColors(BASE_COLORS);

/** `'oq'` is never a restricted paint, so a leaf's own `colorIds` (if any)
 *  never needs to mention it — every leaf and every colour list implicitly
 *  includes it. */
const colorAllowed = (leaf: Leaf | undefined, colorId: string) =>
  colorId === DEFAULT_COLOR || !leaf?.colorIds || leaf.colorIds.includes(colorId);

/**
 * The showroom's state, as one graph rather than useState scattered across
 * screens — the journey is linear and every screen needs the same answers.
 *
 * Two axes: which room, and which door. Colour was removed (re-tinting a white
 * leaf with white paint read as fake) and price with it — this runs on a touch
 * monitor beside a salesperson, to show doors, not to take orders.
 */
export type Screen = 'attract' | 'room' | 'door' | 'trim' | 'color' | 'summary';

/**
 * Forward moves only. Back is derived — see `back()`.
 *
 * Door before colour, not colour before door: a colour is a paint a specific
 * model is sold in, not a universal swatch, so the model has to be chosen
 * before its colours mean anything. Trim design sits between the two: it's
 * an independent choice, but only worth showing once a customer already has
 * a door standing in the room to see it against.
 */
const NEXT: Record<Screen, Screen | null> = {
  attract: 'room',
  room: 'door',
  door: 'trim',
  trim: 'color',
  color: 'summary',
  summary: null,
};

const PREV: Record<Screen, Screen | null> = {
  attract: null,
  room: 'attract',
  door: 'room',
  trim: 'door',
  color: 'trim',
  summary: 'color',
};

/**
 * The step numbering shown on screen ("02 / 04" etc.) — a fifth step,
 * exactly here, once at least one trim design has been published; the
 * SAME 4-step flow as before it. Every screen calls this instead of a
 * hardcoded string, so the count and position stay correct either way.
 */
const STEP_ORDER: Screen[] = ['room', 'door', 'trim', 'color', 'summary'];
export function stepLabel(screen: Screen, hasTrim: boolean): string {
  const order = hasTrim ? STEP_ORDER : STEP_ORDER.filter((s) => s !== 'trim');
  const i = order.indexOf(screen) + 1;
  return `${String(i).padStart(2, '0')} / ${String(order.length).padStart(2, '0')}`;
}

interface KioskState {
  screen: Screen;
  lang: Lang;
  roomId: string;
  leafId: string;
  /** The paint — applies to the leaf AND, by default, to the casing. */
  colorId: string;
  /** The casing's colour, or TRIM_SAME to follow the door. */
  trimColorId: string;
  /** Which trim DESIGN is shown, independent of colour — TRIM_DEFAULT means
   *  no override, falling through to the door's own trim or the room's (see
   *  WallStage.tsx's priority). An id not found in `trims` (stale, removed
   *  at the bench) is treated the same as TRIM_DEFAULT at render time. */
  trimModelId: string;
  /** The live lists — in state so a bench change appears without a reload. */
  leaves: Leaf[];
  rooms: Room[];
  trims: TrimModel[];
  /** Built-in + bench-registered paints. Not filtered — a leaf's own
   *  `colorIds` does the filtering, against this full list. */
  colors: DoorColor[];

  go: (screen: Screen) => void;
  next: () => void;
  back: () => void;
  reset: () => void;

  setLang: (lang: Lang) => void;
  cycleLang: () => void;

  setRoom: (id: string) => void;
  setLeaf: (id: string) => void;
  setColor: (id: string) => void;
  setTrimColor: (id: string) => void;
  setTrimModel: (id: string) => void;
  /** Carousel swipe: ±1 through the door list, wrapping. */
  stepLeaf: (delta: number) => void;
  refresh: () => void;
}

const first = <T extends { id: string }>(list: T[], fallback: string) => (list[0]?.id ?? fallback);

export const useKiosk = create<KioskState>((set) => ({
  screen: 'attract',
  lang: 'uz',
  roomId: first(buildRooms(), BASE_ROOMS[0].id),
  leafId: first(buildLeaves(), BASE_LEAVES[0].id),
  colorId: DEFAULT_COLOR,
  trimColorId: TRIM_SAME,
  trimModelId: TRIM_DEFAULT,
  leaves: buildLeaves(),
  rooms: buildRooms(),
  trims: buildTrims(),
  colors: buildColors(),

  go: (screen) => set({ screen }),
  // The 'trim' step is skipped in both directions while the catalogue is
  // empty — nothing to choose, so nothing to show.
  next: () =>
    set((s) => {
      let n = NEXT[s.screen];
      if (n === 'trim' && s.trims.length === 0) n = NEXT.trim;
      return { screen: n ?? s.screen };
    }),
  back: () =>
    set((s) => {
      let p = PREV[s.screen];
      if (p === 'trim' && s.trims.length === 0) p = PREV.trim;
      return { screen: p ?? s.screen };
    }),

  /**
   * Rebuild all three lists, and keep the current selection valid: if the
   * door or room in view was just hidden or deleted at the bench, fall back
   * to the first one rather than leaving the stage pointing at nothing. A
   * door's own colour list can also have just changed underneath a customer
   * mid-session, so the paint is re-checked against it too.
   */
  refresh: () =>
    set((s) => {
      const leaves = buildLeaves();
      const rooms = buildRooms();
      const trims = buildTrims();
      const colors = buildColors();
      const leafId = leaves.some((l) => l.id === s.leafId) ? s.leafId : first(leaves, s.leafId);
      const leaf = leaves.find((l) => l.id === leafId);
      return {
        leaves,
        rooms,
        trims,
        colors,
        leafId,
        roomId: rooms.some((r) => r.id === s.roomId) ? s.roomId : first(rooms, s.roomId),
        colorId: colorAllowed(leaf, s.colorId) ? s.colorId : DEFAULT_COLOR,
        // A stale/removed pick is left as-is rather than reset here — it
        // resolves to TRIM_DEFAULT at render time (WallStage.tsx), same as
        // an id that was never valid, so there is nothing to correct.
      };
    }),

  /**
   * "Start over" — a deliberate button, never a timer. This is a staffed
   * monitor, so a customer who is thinking keeps their door; the salesperson
   * clears the screen when they decide to.
   */
  reset: () => {
    const leaves = buildLeaves();
    const rooms = buildRooms();
    const trims = buildTrims();
    const colors = buildColors();
    set({
      screen: 'attract', lang: 'uz',
      roomId: first(rooms, BASE_ROOMS[0].id), leafId: first(leaves, BASE_LEAVES[0].id),
      colorId: DEFAULT_COLOR, trimColorId: TRIM_SAME, trimModelId: TRIM_DEFAULT,
      leaves, rooms, trims, colors,
    });
  },

  setLang: (lang) => set({ lang }),
  cycleLang: () => set((s) => ({ lang: LANGS[(LANGS.indexOf(s.lang) + 1) % LANGS.length] })),

  // The room stays put while the door changes under it: a customer compares
  // doors in the one room they picked, which is the whole point of the stage.
  setRoom: (roomId) => set({ roomId }),
  // Changing the door can strand a colour that door isn't sold in — e.g. a
  // customer set a paint, went back, and picked a different model. Falling
  // back to 'oq' (always allowed, never a restricted paint) beats silently
  // keeping an "unofficial" colour on the new model.
  setLeaf: (leafId) =>
    set((s) => {
      const leaf = s.leaves.find((l) => l.id === leafId);
      return { leafId, colorId: colorAllowed(leaf, s.colorId) ? s.colorId : DEFAULT_COLOR };
    }),
  setColor: (colorId) => set({ colorId }),
  setTrimColor: (trimColorId) => set({ trimColorId }),
  setTrimModel: (trimModelId) => set({ trimModelId }),

  stepLeaf: (delta) =>
    set((s) => {
      const i = s.leaves.findIndex((l) => l.id === s.leafId);
      const leaf = s.leaves[(i + delta + s.leaves.length) % s.leaves.length];
      return { leafId: leaf.id, colorId: colorAllowed(leaf, s.colorId) ? s.colorId : DEFAULT_COLOR };
    }),
}));

// A door or room changed at the bench should appear in the showroom without a
// reload — the bench dispatches this, and the store rebuilds.
if (typeof window !== 'undefined') {
  window.addEventListener('dc-catalog-changed', () => useKiosk.getState().refresh());
}
