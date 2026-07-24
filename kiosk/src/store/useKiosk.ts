import { create } from 'zustand';
import { LEAVES as BASE_LEAVES } from '../catalog/leaves.generated';
import { ROOMS as BASE_ROOMS } from '../catalog/rooms.generated';
import { mergeLeaves, mergeRooms } from '../admin/adminStore';
import type { Leaf, Room } from '../catalog/types';
import { LANGS, type Lang } from '../i18n/strings';

/**
 * The catalogue the showroom shows: the doors and rooms the pipeline prepared,
 * plus anything a salesperson added or edited at the bench. Built-ins and bench
 * items are the same shape, so the app cannot tell them apart — which is the
 * point. Held in state, and rebuilt whenever the bench changes, so a published
 * door or room appears without a reload.
 */
const buildLeaves = (): Leaf[] => mergeLeaves(BASE_LEAVES);
const buildRooms = (): Room[] => mergeRooms(BASE_ROOMS);

/**
 * The showroom's state, as one graph rather than useState scattered across
 * screens — the journey is linear and every screen needs the same answers.
 *
 * Two axes: which room, and which door. Colour was removed (re-tinting a white
 * leaf with white paint read as fake) and price with it — this runs on a touch
 * monitor beside a salesperson, to show doors, not to take orders.
 */
export type Screen = 'attract' | 'room' | 'door' | 'summary';

/** Forward moves only. Back is derived — see `back()`. */
const NEXT: Record<Screen, Screen | null> = {
  attract: 'room',
  room: 'door',
  door: 'summary',
  summary: null,
};

const PREV: Record<Screen, Screen | null> = {
  attract: null,
  room: 'attract',
  door: 'room',
  summary: 'door',
};

interface KioskState {
  screen: Screen;
  lang: Lang;
  roomId: string;
  leafId: string;
  /** The live lists — in state so a bench change appears without a reload. */
  leaves: Leaf[];
  rooms: Room[];

  go: (screen: Screen) => void;
  next: () => void;
  back: () => void;
  reset: () => void;

  setLang: (lang: Lang) => void;
  cycleLang: () => void;

  setRoom: (id: string) => void;
  setLeaf: (id: string) => void;
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
  leaves: buildLeaves(),
  rooms: buildRooms(),

  go: (screen) => set({ screen }),
  next: () => set((s) => ({ screen: NEXT[s.screen] ?? s.screen })),
  back: () => set((s) => ({ screen: PREV[s.screen] ?? s.screen })),

  /**
   * Rebuild both lists, and keep the current selection valid: if the door or
   * room in view was just hidden or deleted at the bench, fall back to the first
   * one rather than leaving the stage pointing at nothing.
   */
  refresh: () =>
    set((s) => {
      const leaves = buildLeaves();
      const rooms = buildRooms();
      return {
        leaves,
        rooms,
        leafId: leaves.some((l) => l.id === s.leafId) ? s.leafId : first(leaves, s.leafId),
        roomId: rooms.some((r) => r.id === s.roomId) ? s.roomId : first(rooms, s.roomId),
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
    set({ screen: 'attract', lang: 'uz', roomId: first(rooms, BASE_ROOMS[0].id), leafId: first(leaves, BASE_LEAVES[0].id), leaves, rooms });
  },

  setLang: (lang) => set({ lang }),
  cycleLang: () => set((s) => ({ lang: LANGS[(LANGS.indexOf(s.lang) + 1) % LANGS.length] })),

  // The room stays put while the door changes under it: a customer compares
  // doors in the one room they picked, which is the whole point of the stage.
  setRoom: (roomId) => set({ roomId }),
  setLeaf: (leafId) => set({ leafId }),

  stepLeaf: (delta) =>
    set((s) => {
      const i = s.leaves.findIndex((l) => l.id === s.leafId);
      return { leafId: s.leaves[(i + delta + s.leaves.length) % s.leaves.length].id };
    }),
}));

// A door or room changed at the bench should appear in the showroom without a
// reload — the bench dispatches this, and the store rebuilds.
if (typeof window !== 'undefined') {
  window.addEventListener('dc-catalog-changed', () => useKiosk.getState().refresh());
}
