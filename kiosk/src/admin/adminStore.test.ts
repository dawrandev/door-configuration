// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STORAGE_FULL, editLeaf, isBuiltIn, isOverridden, mergeColors, mergeLeaves,
  mergeRooms, mergeTrims, removeLeaf, restoreLeaf, saveLeaf, type AdminLeaf,
} from './adminStore';
import type { Leaf, Room, TrimModel } from '../catalog/types';
import type { DoorColor } from '../catalog/colors';

/**
 * The merge and delete-vs-hide rules, pinned.
 *
 * These are the semantics the catalogue has always had, and they are about to
 * be reimplemented on the server (built-in vs bench becomes an `origin` column,
 * the edits overlay becomes plain columns, delete-vs-hide is decided in a
 * controller). So this suite is deliberately written as a statement of the
 * CONTRACT rather than of the implementation: whatever replaces localStorage
 * has to keep passing it, or the showroom behaves differently after the
 * migration and nobody notices until a salesperson does.
 */

const leaf = (id: string, name = id): Leaf => ({
  id,
  name: { uz: name, kk: name, ru: name },
  image: `/assets/leaves/${id}.webp`,
  aspect: 0.4,
  handleSide: 'left',
  handleSwappable: false,
});

const benchLeaf = (id: string, name = id): AdminLeaf => ({ ...leaf(id, name), createdAt: 1 });

const BUILTINS: Leaf[] = [leaf('lattice'), leaf('classic'), leaf('twopanel')];

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('mergeLeaves', () => {
  it('returns the built-ins untouched when the bench is empty', () => {
    expect(mergeLeaves(BUILTINS).map((l) => l.id)).toEqual(['lattice', 'classic', 'twopanel']);
  });

  it('appends a bench-added door after the built-ins', () => {
    saveLeaf(benchLeaf('a-new'));
    expect(mergeLeaves(BUILTINS).map((l) => l.id)).toEqual(['lattice', 'classic', 'twopanel', 'a-new']);
  });

  /**
   * The re-cut case, and the reason `dedup` builds a Map rather than
   * concatenating: a built-in republished at the bench must REPLACE itself, not
   * appear twice — and it must keep its place in the catalogue, so a
   * salesperson who re-cuts the second door does not find it has jumped to the
   * end of the strip.
   */
  it('replaces a built-in in place when the bench overrides it, keeping its position', () => {
    saveLeaf({ ...benchLeaf('classic', 'Re-cut'), image: 'data:image/jpeg;base64,xxx' });
    const merged = mergeLeaves(BUILTINS);
    expect(merged.map((l) => l.id)).toEqual(['lattice', 'classic', 'twopanel']);
    expect(merged[1].image).toBe('data:image/jpeg;base64,xxx');
  });

  it('hides an item the edits overlay marks hidden', () => {
    editLeaf('classic', { hidden: true });
    expect(mergeLeaves(BUILTINS).map((l) => l.id)).toEqual(['lattice', 'twopanel']);
  });

  it('overlays a rename across all three languages', () => {
    editLeaf('lattice', { name: 'Yangi nom' });
    expect(mergeLeaves(BUILTINS)[0].name).toEqual({ uz: 'Yangi nom', kk: 'Yangi nom', ru: 'Yangi nom' });
  });

  /** 'none' is not a side — it means "this door wears the handle it was
   *  photographed with", so the stage must stop compositing one over it. */
  it("treats a handleSide of 'none' as not swappable, keeping the original side", () => {
    editLeaf('lattice', { handleSide: 'none' });
    const l = mergeLeaves(BUILTINS)[0];
    expect(l.handleSwappable).toBe(false);
    expect(l.handleSide).toBe('left');
  });

  it('applies a real handleSide override and marks the door swappable', () => {
    editLeaf('lattice', { handleSide: 'right' });
    const l = mergeLeaves(BUILTINS)[0];
    expect(l.handleSwappable).toBe(true);
    expect(l.handleSide).toBe('right');
  });
});

describe('removeLeaf — delete or hide, never both', () => {
  /** A pure bench door has its own record, so deleting really deletes. */
  it('deletes a bench door outright', () => {
    saveLeaf(benchLeaf('a-new'));
    removeLeaf('a-new');
    expect(mergeLeaves(BUILTINS).map((l) => l.id)).toEqual(['lattice', 'classic', 'twopanel']);
    expect(localStorage.getItem('dc.leaves.v1')).toBe('[]');
  });

  /**
   * Deleting a re-cut built-in drops the override and lets the ORIGINAL
   * resurface — the same button doubles as "restore original", which is the
   * only way back to the shipped pixels.
   */
  it('restores the original when deleting a re-cut built-in', () => {
    saveLeaf({ ...benchLeaf('classic'), image: 'data:image/jpeg;base64,xxx' });
    expect(isOverridden('classic')).toBe(true);
    removeLeaf('classic');
    const merged = mergeLeaves(BUILTINS);
    expect(merged.map((l) => l.id)).toEqual(['lattice', 'classic', 'twopanel']);
    expect(merged[1].image).toBe('/assets/leaves/classic.webp');
    expect(isOverridden('classic')).toBe(false);
  });

  /** An untouched built-in's pixels are in the bundle; there is nothing to
   *  delete, so it is hidden instead — and can be brought back. */
  it('hides an untouched built-in rather than deleting it', () => {
    removeLeaf('twopanel');
    expect(mergeLeaves(BUILTINS).map((l) => l.id)).toEqual(['lattice', 'classic']);
    restoreLeaf('twopanel');
    expect(mergeLeaves(BUILTINS).map((l) => l.id)).toEqual(['lattice', 'classic', 'twopanel']);
  });

  /** Restoring un-hides but must NOT undo a rename — they are separate edits
   *  that happen to share a record. */
  it('keeps a rename through a hide and a restore', () => {
    editLeaf('lattice', { name: 'Nomlangan' });
    removeLeaf('lattice');
    restoreLeaf('lattice');
    expect(mergeLeaves(BUILTINS)[0].name.uz).toBe('Nomlangan');
  });
});

describe('isBuiltIn', () => {
  it("reads the 'a-' prefix as bench-added and everything else as built-in", () => {
    expect(isBuiltIn('lattice')).toBe(true);
    expect(isBuiltIn('a-m1k2j3')).toBe(false);
  });
});

describe('storage exhaustion', () => {
  /**
   * The one failure the shop floor actually meets, since every record carries a
   * photograph. The DOMException differs by browser, so the store normalises it
   * to a named error the benches can turn into something an operator can act
   * on. RoomBench and TrimBench do not yet catch it — that is the next phase,
   * and this test is its precondition.
   */
  it('surfaces a quota failure as a named STORAGE_FULL error', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('exceeded', 'QuotaExceededError');
    });
    expect(() => saveLeaf(benchLeaf('a-big'))).toThrowError(STORAGE_FULL);
  });

  /** The showroom must not be told a catalogue changed when it did not. */
  it('does not announce a change when the write failed', () => {
    const listener = vi.fn();
    window.addEventListener('dc-catalog-changed', listener);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('exceeded', 'QuotaExceededError');
    });
    expect(() => saveLeaf(benchLeaf('a-big'))).toThrow();
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('dc-catalog-changed', listener);
  });

  /** Corrupt or half-written JSON must degrade to "nothing added", never crash
   *  the showroom on boot. */
  it('falls back to the built-ins when stored JSON is unreadable', () => {
    localStorage.setItem('dc.leaves.v1', '{not json');
    expect(mergeLeaves(BUILTINS).map((l) => l.id)).toEqual(['lattice', 'classic', 'twopanel']);
  });
});

describe('the other three catalogues merge the same way', () => {
  const room = (id: string): Room => ({
    id, name: { uz: id, kk: id, ru: id }, image: `/r/${id}.jpg`,
    aspect: 0.75, open: { x: 0, y: 0, w: 1, h: 1 }, light: [1, 1, 1],
  });
  const trim = (id: string, category: 'nalichnik' | 'korona' = 'nalichnik'): TrimModel => ({
    id, name: { uz: id, kk: id, ru: id }, category,
    trimMargin: { left: 0, right: 0, top: 0, bottom: 0 }, trimBoxes: [], trimSource: `/t/${id}.webp`,
  });
  const color = (id: string): DoorColor => ({ id, name: { uz: id, kk: id, ru: id }, hex: '#ffffff' });

  it('merges rooms, trims and colours from an empty bench unchanged', () => {
    expect(mergeRooms([room('living')]).map((r) => r.id)).toEqual(['living']);
    expect(mergeTrims([trim('t1')]).map((t) => t.id)).toEqual(['t1']);
    expect(mergeColors([color('oq')]).map((c) => c.id)).toEqual(['oq']);
  });

  /** Colours are add-only: no hide, no edit overlay. Once a shade is mixed and
   *  named there is no reason to take it from a door already wearing it. */
  it('has no hidden or rename path for colours', () => {
    expect(mergeColors([color('oq'), color('krem')]).map((c) => c.id)).toEqual(['oq', 'krem']);
  });
});
