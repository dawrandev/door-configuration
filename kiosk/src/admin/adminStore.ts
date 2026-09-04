import type { Leaf, Room, TrimModel, TrimRole } from '../catalog/types';
import type { DoorColor } from '../catalog/colors';

export type { TrimRole };

/**
 * Everything the bench changes, kept in this browser.
 *
 * Four drawers, all localStorage so the shop floor needs no server today; when a
 * Laravel backend lands, these same records POST unchanged and the showroom
 * cannot tell the difference. Two hold whole new items a salesperson added
 * (doors, rooms); two hold light EDITS to the built-in ones — a rename, a
 * hidden flag — so the generated catalogue is never mutated, only overlaid.
 */
const K = {
  leaves: 'dc.leaves.v1',
  leafEdits: 'dc.leafedits.v1',
  rooms: 'dc.rooms.v1',
  roomEdits: 'dc.roomedits.v1',
  colors: 'dc.colors.v1',
  trims: 'dc.trims.v1',
  trimEdits: 'dc.trimedits.v1',
};

/**
 * A bench door or room keeps its SOURCE alongside the finished result, so it can
 * be reopened and re-marked rather than deleted and redone. The source is stored
 * downscaled — enough to re-process cleanly, small enough that a catalogue of
 * them stays inside the localStorage budget.
 */
export type AdminLeaf = Leaf & {
  image: string;
  createdAt: number;
  source?: string;
  corners?: { x: number; y: number }[];
  white?: boolean;
  handleChoice?: 'left' | 'right' | 'none';
};
export type AdminRoom = Room & {
  createdAt: number;
  source?: string;
  box?: { x: number; y: number; w: number; h: number };
  /**
   * Read-only fallback for rooms saved before a piece's role lived on the
   * box itself (`Room.trimBoxes[].role`) — parallel to `trimBoxes`, same
   * order. Never written by a fresh publish; only consulted when reopening
   * older data that has it and the boxes themselves don't.
   */
  legacyTrimRoles?: { role: TrimRole; label?: string }[];
};
/** A colour a salesperson registered at the bench — add-only, no edit or hide:
 *  once a shade is mixed and named, there's no reason to take it away from a
 *  door that already wears it. */
export type AdminColor = DoorColor & { createdAt: number };
export type AdminTrim = TrimModel & {
  createdAt: number;
  source?: string;
  corners?: { x: number; y: number }[];
};
/** A light edit that overlays a built-in OR admin item, never replacing it. */
export interface Edit {
  name?: string;
  handleSide?: 'left' | 'right' | 'none';
  hidden?: boolean;
}

function read<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
/** Thrown when the browser's storage budget is used up — the one failure the
 *  shop floor will actually meet, since every record carries a photograph.
 *  Named rather than raw, because the DOMException for it differs by browser
 *  and a bench needs to say something an operator can act on. */
export const STORAGE_FULL = 'STORAGE_FULL';

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    throw new Error(STORAGE_FULL, { cause: e });
  }
  window.dispatchEvent(new CustomEvent('dc-catalog-changed'));
}

// ---- doors ----
export const loadLeaves = (): AdminLeaf[] => read<AdminLeaf[]>(K.leaves, []);
export const loadLeafEdits = (): Record<string, Edit> => read(K.leafEdits, {});

export function saveLeaf(leaf: AdminLeaf) {
  write(K.leaves, [...loadLeaves().filter((l) => l.id !== leaf.id), leaf]);
}
export function editLeaf(id: string, patch: Edit) {
  const e = loadLeafEdits();
  e[id] = { ...e[id], ...patch };
  write(K.leafEdits, e);
}
export function removeLeaf(id: string) {
  /**
   * Three cases, one rule: drop the bench entry if there is one, else hide.
   *  - a pure bench door → its entry is deleted, and it is gone.
   *  - a built-in that was RE-CUT at the bench → deleting the override lets the
   *    original resurface, so this doubles as "restore original".
   *  - a built-in never touched → it has no bench entry, so it is hidden (its
   *    pixels are in the bundle; there is nothing to delete).
   */
  if (loadLeaves().some((l) => l.id === id)) write(K.leaves, loadLeaves().filter((l) => l.id !== id));
  else editLeaf(id, { hidden: true });
}
/** True when a built-in has been re-cut at the bench (an override exists). */
export const isOverridden = (id: string) => !id.startsWith('a-') && loadLeaves().some((l) => l.id === id);
export const isRoomOverridden = (id: string) => !id.startsWith('a-') && loadRooms().some((r) => r.id === id);
export function restoreLeaf(id: string) {
  const e = loadLeafEdits();
  if (e[id]) { delete e[id].hidden; write(K.leafEdits, e); }
}

// ---- rooms ----
export const loadRooms = (): AdminRoom[] => read<AdminRoom[]>(K.rooms, []);
export const loadRoomEdits = (): Record<string, Edit> => read(K.roomEdits, {});

export function saveRoom(room: AdminRoom) {
  write(K.rooms, [...loadRooms().filter((r) => r.id !== room.id), room]);
}
export function editRoom(id: string, patch: Edit) {
  const e = loadRoomEdits();
  e[id] = { ...e[id], ...patch };
  write(K.roomEdits, e);
}
export function removeRoom(id: string) {
  if (loadRooms().some((r) => r.id === id)) write(K.rooms, loadRooms().filter((r) => r.id !== id));
  else editRoom(id, { hidden: true });
}
export function restoreRoom(id: string) {
  const e = loadRoomEdits();
  if (e[id]) { delete e[id].hidden; write(K.roomEdits, e); }
}

// ---- trim designs ----
export const loadTrims = (): AdminTrim[] => read<AdminTrim[]>(K.trims, []);
export const loadTrimEdits = (): Record<string, Edit> => read(K.trimEdits, {});

export function saveTrimModel(trim: AdminTrim) {
  write(K.trims, [...loadTrims().filter((t) => t.id !== trim.id), trim]);
}
export function editTrim(id: string, patch: Edit) {
  const e = loadTrimEdits();
  e[id] = { ...e[id], ...patch };
  write(K.trimEdits, e);
}
export function removeTrimModel(id: string) {
  if (loadTrims().some((t) => t.id === id)) write(K.trims, loadTrims().filter((t) => t.id !== id));
  else editTrim(id, { hidden: true });
}
export const isTrimOverridden = (id: string) => !id.startsWith('a-') && loadTrims().some((t) => t.id === id);
export function restoreTrimModel(id: string) {
  const e = loadTrimEdits();
  if (e[id]) { delete e[id].hidden; write(K.trimEdits, e); }
}

// ---- colours ----
export const loadColors = (): AdminColor[] => read<AdminColor[]>(K.colors, []);
export function saveColor(color: AdminColor) {
  write(K.colors, [...loadColors().filter((c) => c.id !== color.id), color]);
}

/**
 * Merge built-ins with the bench, then overlay edits.
 *
 * Deduped by id, bench version winning: a built-in that was re-cut at the bench
 * is REPLACED by its override rather than shown twice, and order is preserved so
 * a re-cut door keeps its place in the catalogue. Edits (rename, handle, hidden)
 * then apply on top. One shape for doors and rooms so they compose identically.
 */
function dedup<T extends { id: string }>(base: T[], added: T[]): T[] {
  const byId = new Map<string, T>();
  for (const x of base) byId.set(x.id, x);
  for (const x of added) byId.set(x.id, x); // bench overrides built-in
  return [...byId.values()];
}
export function mergeLeaves(base: Leaf[]): Leaf[] {
  const edits = loadLeafEdits();
  return dedup(base, loadLeaves())
    .filter((l) => !edits[l.id]?.hidden)
    .map((l) => {
      const e = edits[l.id];
      if (!e) return l;
      return {
        ...l,
        name: e.name ? { uz: e.name, kk: e.name, ru: e.name } : l.name,
        ...(e.handleSide
          ? { handleSide: e.handleSide === 'none' ? l.handleSide : e.handleSide, handleSwappable: e.handleSide !== 'none' }
          : {}),
      };
    });
}
export function mergeRooms(base: Room[]): Room[] {
  const edits = loadRoomEdits();
  return dedup(base, loadRooms())
    .filter((r) => !edits[r.id]?.hidden)
    .map((r) => (edits[r.id]?.name ? { ...r, name: { uz: edits[r.id].name!, kk: edits[r.id].name!, ru: edits[r.id].name! } } : r));
}
/** No edits to overlay — colours are add-only, so this is just the dedup. */
export function mergeColors(base: DoorColor[]): DoorColor[] {
  return dedup(base, loadColors());
}
export function mergeTrims(base: TrimModel[]): TrimModel[] {
  const edits = loadTrimEdits();
  return dedup(base, loadTrims())
    .filter((t) => !edits[t.id]?.hidden)
    .map((t) => (edits[t.id]?.name ? { ...t, name: { uz: edits[t.id].name!, kk: edits[t.id].name!, ru: edits[t.id].name! } } : t));
}

/** True for a built-in item, whose pixels are in the bundle (hidden, not deleted). */
export const isBuiltIn = (id: string) => !id.startsWith('a-');
