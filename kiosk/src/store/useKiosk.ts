import { create } from 'zustand';
import { getCatalog, getCatalogVersion } from '../api/catalog';
import type { Leaf, Room, TrimModel } from '../catalog/types';
import { DEFAULT_COLOR, TRIM_SAME, TRIM_DEFAULT, type DoorColor } from '../catalog/colors';
import { LANGS, type Lang } from '../i18n/strings';

/**
 * The catalogue the showroom shows now comes from the backend, not from a
 * compiled-in list merged with this browser's own localStorage.
 *
 * That was the whole point of the move: a door published at the bench has to
 * appear in the showroom, and the showroom is frequently not even the same
 * machine. Nothing else about the journey changed — the lists still live in
 * state, and built-ins and bench items are still the same shape, so no screen
 * can tell them apart.
 */

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
export type Screen = 'attract' | 'room' | 'door' | 'nalichnik' | 'korona' | 'color' | 'summary';

/**
 * Forward moves only. Back is derived — see `back()`.
 *
 * Door before colour, not colour before door: a colour is a paint a specific
 * model is sold in, not a universal swatch, so the model has to be chosen
 * before its colours mean anything. Nalichnik and korona sit between the
 * two, as two fully independent picks of their own — neither is implied by
 * the door, or by each other; a customer who wants the room's own casing
 * for both simply leaves them on "Standart".
 */
const NEXT: Record<Screen, Screen | null> = {
  attract: 'room',
  room: 'door',
  door: 'nalichnik',
  nalichnik: 'korona',
  korona: 'color',
  color: 'summary',
  summary: null,
};

const PREV: Record<Screen, Screen | null> = {
  attract: null,
  room: 'attract',
  door: 'room',
  nalichnik: 'door',
  korona: 'nalichnik',
  color: 'korona',
  summary: 'color',
};

/** Whether a screen should be skipped — no nalichnik designs published
 *  means nothing to choose there, so nothing to show; independent of
 *  whether korona has any (and vice versa). */
const SKIP: Partial<Record<Screen, (trims: TrimModel[]) => boolean>> = {
  nalichnik: (trims) => !trims.some((t) => t.category === 'nalichnik'),
  korona: (trims) => !trims.some((t) => t.category === 'korona'),
};

/** Advance through `table` from `screen`, skipping past every screen whose
 *  `SKIP` predicate is true — both nalichnik and korona can be empty at
 *  once, so a single step needs to be able to fall through two in a row. */
function walk(table: Record<Screen, Screen | null>, screen: Screen, trims: TrimModel[]): Screen {
  let s = screen;
  for (;;) {
    const n = table[s] ?? s;
    if (n === s) return n;
    if (!SKIP[n]?.(trims)) return n;
    s = n;
  }
}

/**
 * The step numbering shown on screen ("02 / 04" etc.) — six steps once both
 * a nalichnik and a korona design have been published, fewer if either (or
 * both) catalogues are still empty; the SAME 4-step flow as before either
 * existed. Every screen calls this instead of a hardcoded string, so the
 * count and position stay correct in every combination.
 */
const STEP_ORDER: Screen[] = ['room', 'door', 'nalichnik', 'korona', 'color', 'summary'];
export function stepLabel(screen: Screen, opts: { hasNalichnik: boolean; hasKorona: boolean }): string {
  const order = STEP_ORDER.filter((s) => (s === 'nalichnik' ? opts.hasNalichnik : s === 'korona' ? opts.hasKorona : true));
  const i = order.indexOf(screen) + 1;
  return `${String(i).padStart(2, '0')} / ${String(order.length).padStart(2, '0')}`;
}

/** Whether the catalogue has arrived. Every screen needs a list to render,
 *  and over a network there is a moment when there is none — which the old
 *  compiled-in catalogue never had. */
export type CatalogStatus = 'loading' | 'ready' | 'error';

interface KioskState {
  status: CatalogStatus;
  /** Why the catalogue could not be read, for the retry screen. */
  error?: string;
  /** The backend's own version string. Polled, so a door published at the
   *  bench reaches a showroom running on another machine. */
  version: string;
  screen: Screen;
  lang: Lang;
  roomId: string;
  leafId: string;
  /** The paint — applies to the leaf AND, by default, to the casing. */
  colorId: string;
  /** The casing's colour, or TRIM_SAME to follow the door. */
  trimColorId: string;
  /** Which nalichnik / korona DESIGN is shown — two fully independent
   *  picks, neither implying the other. TRIM_DEFAULT means no override,
   *  falling through to the room's own trim (see WallStage.tsx's
   *  priority). An id not found in `trims` (stale, removed at the bench)
   *  is treated the same as TRIM_DEFAULT at render time. */
  nalichnikId: string;
  koronaId: string;
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
  setNalichnik: (id: string) => void;
  setKorona: (id: string) => void;
  /** Carousel swipe: ±1 through the door list, wrapping. */
  stepLeaf: (delta: number) => void;
  /** Re-read the catalogue from the backend. */
  refresh: () => Promise<void>;
}

const first = <T extends { id: string }>(list: T[], fallback: string) => (list[0]?.id ?? fallback);

export const useKiosk = create<KioskState>((set) => ({
  status: 'loading',
  version: '',
  screen: 'attract',
  lang: 'uz',
  roomId: '',
  leafId: '',
  colorId: DEFAULT_COLOR,
  trimColorId: TRIM_SAME,
  nalichnikId: TRIM_DEFAULT,
  koronaId: TRIM_DEFAULT,
  leaves: [],
  rooms: [],
  trims: [],
  colors: [],

  go: (screen) => set({ screen }),
  next: () => set((s) => ({ screen: walk(NEXT, s.screen, s.trims) })),
  back: () => set((s) => ({ screen: walk(PREV, s.screen, s.trims) })),

  /**
   * Rebuild all three lists, and keep the current selection valid: if the
   * door or room in view was just hidden or deleted at the bench, fall back
   * to the first one rather than leaving the stage pointing at nothing. A
   * door's own colour list can also have just changed underneath a customer
   * mid-session, so the paint is re-checked against it too.
   */
  refresh: async () => {
    try {
      const cat = await getCatalog();
      set((s) => {
        const leafId = cat.leaves.some((l) => l.id === s.leafId) ? s.leafId : first(cat.leaves, s.leafId);
        const leaf = cat.leaves.find((l) => l.id === leafId);
        return {
          status: 'ready' as const,
          error: undefined,
          version: cat.version,
          leaves: cat.leaves,
          rooms: cat.rooms,
          trims: cat.trims,
          colors: cat.colors,
          leafId,
          roomId: cat.rooms.some((r) => r.id === s.roomId) ? s.roomId : first(cat.rooms, s.roomId),
          colorId: colorAllowed(leaf, s.colorId) ? s.colorId : DEFAULT_COLOR,
          // A stale/removed pick is left as-is rather than reset here — it
          // resolves to TRIM_DEFAULT at render time (WallStage.tsx), same as
          // an id that was never valid, so there is nothing to correct.
        };
      });
    } catch (e) {
      // Keep whatever is already on screen: a customer mid-journey should not
      // lose their door because one poll failed. Only a first load, which has
      // nothing to keep, actually shows the error.
      set((s) => (s.status === 'ready' ? s : { status: 'error' as const, error: e instanceof Error ? e.message : String(e) }));
    }
  },

  /**
   * "Start over" — a deliberate button, never a timer. This is a staffed
   * monitor, so a customer who is thinking keeps their door; the salesperson
   * clears the screen when they decide to.
   */
  reset: () =>
    set((s) => ({
      screen: 'attract', lang: 'uz',
      roomId: first(s.rooms, s.roomId), leafId: first(s.leaves, s.leafId),
      colorId: DEFAULT_COLOR, trimColorId: TRIM_SAME, nalichnikId: TRIM_DEFAULT, koronaId: TRIM_DEFAULT,
    })),

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
  setNalichnik: (nalichnikId) => set({ nalichnikId }),
  setKorona: (koronaId) => set({ koronaId }),

  stepLeaf: (delta) =>
    set((s) => {
      const i = s.leaves.findIndex((l) => l.id === s.leafId);
      const leaf = s.leaves[(i + delta + s.leaves.length) % s.leaves.length];
      return { leafId: leaf.id, colorId: colorAllowed(leaf, s.colorId) ? s.colorId : DEFAULT_COLOR };
    }),
}));

/**
 * A door published at the bench has to reach the showroom, and the two are
 * usually different machines — so this can no longer be a same-tab event. The
 * version endpoint is a few bytes and answers from one indexed query, so
 * polling it is cheaper than re-reading the catalogue to find out nothing
 * changed.
 */
const POLL_MS = 15_000;

export function startCatalogPolling(): () => void {
  const tick = async () => {
    const { status, version, refresh } = useKiosk.getState();
    try {
      const next = await getCatalogVersion();
      if (status !== 'ready' || next.version !== version) await refresh();
    } catch {
      // A dropped network is not worth a visible error while a catalogue is
      // already on screen; the next tick picks it back up.
    }
  };
  const id = window.setInterval(tick, POLL_MS);
  return () => window.clearInterval(id);
}

if (typeof window !== 'undefined') {
  // The bench and the showroom can be the same tab (a salesperson flipping
  // between them), where waiting out a poll would feel broken.
  window.addEventListener('dc-catalog-changed', () => { void useKiosk.getState().refresh(); });
}

/** Whether each of the two independent trim categories has anything
 *  published — every screen needs this for `stepLabel`, so it lives here
 *  once instead of five separate `trims.some(...)` pairs. */
export function useStepFlags(): { hasNalichnik: boolean; hasKorona: boolean } {
  const trims = useKiosk((s) => s.trims);
  return {
    hasNalichnik: trims.some((t) => t.category === 'nalichnik'),
    hasKorona: trims.some((t) => t.category === 'korona'),
  };
}
