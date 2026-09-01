import { create } from 'zustand';
import { LEAVES as BASE_LEAVES } from '../catalog/leaves.generated';
import { ROOMS as BASE_ROOMS } from '../catalog/rooms.generated';
import { mergeLeaves, mergeRooms, mergeColors } from '../admin/adminStore';
import type { Leaf, Room } from '../catalog/types';
import { COLORS as BASE_COLORS, DEFAULT_COLOR, TRIM_SAME, type DoorColor } from '../catalog/colors';
import { LANGS, type Lang } from '../i18n/strings';

/**
 * The catalogue the showroom shows: the doors, rooms and colours the pipeline
 * prepared, plus anything a salesperson added or edited at the bench. Built-ins
 * and bench items are the same shape, so the app cannot tell them apart — which
 * is the point. Held in state, and rebuilt whenever the bench changes, so a
 * published door, room or colour appears without a reload.
 */
const buildLeaves = (): Leaf[] => mergeLeaves(BASE_LEAVES);
const buildRooms = (): Room[] => mergeRooms(BASE_ROOMS);
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
export type Screen = 'attract' | 'room' | 'door' | 'color' | 'summary';

/**
 * Forward moves only. Back is derived — see `back()`.
 *
 * Door before colour, not colour before door: a colour is a paint a specific
 * model is sold in, not a universal swatch, so the model has to be chosen
 * before its colours mean anything.
 */
const NEXT: Record<Screen, Screen | null> = {
  attract: 'room',
  room: 'door',
  door: 'color',
  color: 'summary',
  summary: null,
};

const PREV: Record<Screen, Screen | null> = {
  attract: null,
  room: 'attract',
  door: 'room',
  color: 'door',
  summary: 'color',
};

interface KioskState {
  screen: Screen;
  lang: Lang;
  roomId: string;
  leafId: string;
  /** The paint — applies to the leaf AND, by default, to the casing. */
  colorId: string;
  /** The casing's colour, or TRIM_SAME to follow the door. */
  trimColorId: string;
  /** The live lists — in state so a bench change appears without a reload. */
  leaves: Leaf[];
  rooms: Room[];
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
  leaves: buildLeaves(),
  rooms: buildRooms(),
  colors: buildColors(),

  go: (screen) => set({ screen }),
  next: () => set((s) => ({ screen: NEXT[s.screen] ?? s.screen })),
  back: () => set((s) => ({ screen: PREV[s.screen] ?? s.screen })),

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
      const colors = buildColors();
      const leafId = leaves.some((l) => l.id === s.leafId) ? s.leafId : first(leaves, s.leafId);
      const leaf = leaves.find((l) => l.id === leafId);
      return {
        leaves,
        rooms,
        colors,
        leafId,
        roomId: rooms.some((r) => r.id === s.roomId) ? s.roomId : first(rooms, s.roomId),
        colorId: colorAllowed(leaf, s.colorId) ? s.colorId : DEFAULT_COLOR,
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
    const colors = buildColors();
    set({ screen: 'attract', lang: 'uz', roomId: first(rooms, BASE_ROOMS[0].id), leafId: first(leaves, BASE_LEAVES[0].id), colorId: DEFAULT_COLOR, trimColorId: TRIM_SAME, leaves, rooms, colors });
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
