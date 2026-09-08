import { describe, expect, it } from 'vitest';
import { derivePasses, groupTouching, signedArea, sourceKey, windLike } from './recolor';
import type { TrimPiece } from '../catalog/types';

/**
 * The recolour maths, pinned.
 *
 * Fixtures are built PROGRAMMATICALLY — never loaded from a real leaf. That is
 * deliberate: the assets are about to be re-encoded from PNG to WebP, and a
 * suite that pinned `rosette.png`'s actual bytes would go red for the one
 * change it is supposed to be protecting, exactly when the safety net matters
 * most. Synthetic inputs test the arithmetic, which is what can silently rot.
 *
 * `derivePasses` takes a Uint8ClampedArray and returns Float32Arrays, so all of
 * this runs with no DOM at all.
 */

/** An RGBA buffer whose pixels come from `f(x, y)`. */
function field(w: number, h: number, f: (x: number, y: number) => [number, number, number, number]): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = f(x, y);
      const o = (y * w + x) * 4;
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = a;
    }
  }
  return d;
}

const flat = (w: number, h: number, v: number, alpha = 255) => field(w, h, () => [v, v, v, alpha]);

/** Smallest and largest value over the pixels `keep` accepts. */
function range(plane: Float32Array, w: number, keep: (x: number, y: number) => boolean) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < plane.length; i++) {
    if (!keep(i % w, Math.floor(i / w))) continue;
    lo = Math.min(lo, plane[i]);
    hi = Math.max(hi, plane[i]);
  }
  return { lo, hi };
}

describe('derivePasses', () => {
  /**
   * The load-bearing property of the whole pipeline. The composite is
   * `out = tint·BASE·AO + SPEC` (see the module docblock), so a flat surface
   * giving BASE=1, AO=1, SPEC=0 means `out = tint` exactly: paint a flat wall
   * the colour you asked for, no more and no less. Everything else the module
   * does is a deviation from this baseline.
   */
  it('leaves a flat opaque surface taking exactly the tint', () => {
    const w = 64, h = 64;
    const p = derivePasses(flat(w, h, 160), w, h);
    const all = () => true;
    const base = range(p.BASE, w, all);
    const ao = range(p.AO, w, all);
    const spec = range(p.SPEC, w, all);

    expect(base.lo).toBeCloseTo(1, 5);
    expect(base.hi).toBeCloseTo(1, 5);
    expect(ao.lo).toBeCloseTo(1, 5);
    expect(ao.hi).toBeCloseTo(1, 5);
    expect(spec.lo).toBe(0);
    expect(spec.hi).toBe(0);
  });

  /**
   * A gradient is LIGHTING, not paint. The whole point of dividing by blur(L)
   * is that a wall lit unevenly still reads as one colour: BASE flattens out
   * and AO carries the shading. Asserted away from the edges, where the box
   * blur's clamped sampling necessarily flattens the ramp.
   */
  it('moves a smooth gradient out of BASE and into AO', () => {
    const w = 64, h = 64;
    const src = field(w, h, (_x, y) => {
      const v = 60 + Math.round((y / (h - 1)) * 150);
      return [v, v, v, 255];
    });
    const p = derivePasses(src, w, h);
    const middle = (_x: number, y: number) => y >= 24 && y < 40;

    const base = range(p.BASE, w, middle);
    expect(base.lo).toBeGreaterThan(0.97);
    expect(base.hi).toBeLessThan(1.03);

    // AO kept the ramp: the bottom of the band is meaningfully lighter than
    // the top, which is the shading BASE just gave up.
    const ao = range(p.AO, w, middle);
    expect(ao.hi - ao.lo).toBeGreaterThan(0.1);
  });

  /**
   * The alpha-weighted lighting estimate (recolor.ts's `blurLA / blurA`).
   *
   * A trim crop's margin can reach past the edge of the photograph, and
   * blurring straight over those zeros used to drag the local lighting down —
   * which crushed AO, pushed BASE up, and made the casing come out muddy on
   * its own surface. Weighting by alpha means empty space contributes nothing
   * instead of contributing black.
   *
   * Asserted as an equivalence: the opaque half of a half-transparent image
   * must derive to the same passes as a fully opaque control. That is the
   * property, stated directly.
   */
  it('ignores transparent pixels when estimating lighting', () => {
    const w = 64, h = 64, v = 160;
    const half = derivePasses(field(w, h, (x) => (x < w / 2 ? [0, 0, 0, 0] : [v, v, v, 255])), w, h);
    const control = derivePasses(flat(w, h, v), w, h);

    const opaque = (x: number) => x >= w / 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!opaque(x)) continue;
        const i = y * w + x;
        expect(half.BASE[i]).toBeCloseTo(control.BASE[i], 4);
        expect(half.AO[i]).toBeCloseTo(control.AO[i], 4);
        expect(half.SPEC[i]).toBeCloseTo(control.SPEC[i], 4);
      }
    }
  });

  /**
   * The golden snapshot: one assertion pinning every magic number in
   * `derivePasses` at once — the 0.055 sigma scale, the 1e-3 and 0.02 floors,
   * the 1.35 BASE clamp, the p98 (0.98) reference, the 1.28 spec threshold and
   * the 0.55 spec gain.
   *
   * It also guards the subtlest hazard in the file: `sorted` at recolor.ts:111
   * is correct only because a TYPED array's `.sort()` is numeric. Rewriting
   * `.slice()` as `[...x]` or `Array.from(x)` — which reads as a harmless
   * modernisation — turns it into a lexicographic string sort, and every door
   * then renders at a plausible but wrong brightness with nothing thrown.
   * These numbers move if that happens.
   */
  it('matches the golden values for a fixed pseudo-random input', () => {
    let seed = 0x9e3779b9;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const w = 32, h = 32;
    const src = field(w, h, () => {
      const v = Math.round(rand() * 255);
      return [v, v, v, 255];
    });
    const p = derivePasses(src, w, h);
    const head = (a: Float32Array) => Array.from(a.slice(0, 8), (n) => Number(n.toFixed(6)));

    // Two 1.35 entries exercise the BASE clamp; two non-zero SPEC entries
    // exercise the 1.28 threshold and the 0.55 gain. If this fixture ever
    // stops hitting both, it has stopped testing what it is here for.
    expect(head(p.BASE)).toEqual([
      0.852102, 0.248598, 1.35, 1.35, 0.233982, 0.686627, 0.052965, 1.039437,
    ]);
    expect(head(p.AO)).toEqual([
      0.773452, 0.778042, 0.783342, 0.789373, 0.796027, 0.803354, 0.811522, 0.820136,
    ]);
    expect(head(p.SPEC)).toEqual([
      0, 0, 0.069092, 0.200493, 0, 0, 0, 0,
    ]);
  });

  /** A door's `keep` regions and the composite are canvas work; the planes
   *  themselves must at least stay finite for every input. */
  it('produces finite planes for a fully black opaque input', () => {
    const w = 32, h = 32;
    const p = derivePasses(flat(w, h, 0), w, h);
    for (const plane of [p.BASE, p.AO, p.SPEC]) {
      for (const n of plane) expect(Number.isFinite(n)).toBe(true);
    }
  });
});

describe('groupTouching', () => {
  const piece = (x: number, y: number, w: number, h: number): TrimPiece => ({ x, y, w, h });

  /**
   * The reason this function exists. A nalichnik is two casings at opposite
   * edges of the photo with the whole door between them; deriving lighting
   * over one crop spanning both means the p98 gets set by the leaf's bright
   * face and the blur smears the door straight through the casing. Two
   * groups, two derivations.
   */
  it('separates two casings that do not touch', () => {
    const groups = groupTouching([piece(0.05, 0.1, 0.06, 0.8), piece(0.7, 0.1, 0.06, 0.8)]);
    expect(groups).toHaveLength(2);
  });

  /** A plinth foot overlaps the shaft it sits under: one continuous piece of
   *  trim, so one shared derivation — or they disagree right where they meet. */
  it('joins an overlapping foot and shaft', () => {
    const groups = groupTouching([piece(0.2, 0.1, 0.1, 0.8), piece(0.22, 0.85, 0.06, 0.05)]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
  });

  /** The comparison is inclusive (`<=`), so boxes that merely abut count as
   *  touching — two mitred lengths of the same moulding usually do. */
  it('joins boxes that touch exactly at an edge', () => {
    expect(groupTouching([piece(0, 0, 0.2, 0.2), piece(0.2, 0, 0.2, 0.2)])).toHaveLength(1);
  });

  /** Union-find, not pairwise: A and C never touch, but both touch B. */
  it('joins a chain whose ends do not touch each other', () => {
    const groups = groupTouching([piece(0, 0, 0.1, 0.1), piece(0.1, 0, 0.1, 0.1), piece(0.2, 0, 0.1, 0.1)]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
  });

  it('returns nothing for no pieces', () => {
    expect(groupTouching([])).toEqual([]);
  });
});

describe('signedArea / windLike', () => {
  // Clockwise on screen (y grows downward) — the winding the benches produce.
  const square = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  const reversed = [...square].reverse();

  it('gives opposite signs for opposite windings', () => {
    expect(signedArea(square)).toBeGreaterThan(0);
    expect(signedArea(reversed)).toBeLessThan(0);
    expect(signedArea(square)).toBeCloseTo(-signedArea(reversed), 12);
  });

  /**
   * A hole must wind OPPOSITE its outer loop for the nonzero fill rule to
   * cancel it out — but a hand-traced loop arrives clicked in whichever
   * direction the operator happened to go, so `windLike` corrects it rather
   * than leaving the cutout to chance.
   */
  it('leaves a loop alone when it already winds the way asked', () => {
    expect(windLike(square, 1)).toBe(square);
    expect(windLike(reversed, -1)).toBe(reversed);
  });

  it('reverses a loop that winds the wrong way', () => {
    const out = windLike(square, -1);
    expect(out).not.toBe(square);
    expect(out).toEqual(reversed);
    expect(Math.sign(signedArea(out))).toBe(-1);
  });
});

describe('sourceKey', () => {
  /*
   * The regression this exists for: sources used to be base64 data URLs, whose
   * LENGTH moved with their content, so the cache keyed on length. They are
   * now URLs carrying a content hash, and every one of those is exactly as
   * long as the next — so a re-cut door kept serving its old recoloured pixels
   * for the life of the page. docs/manual-test.md calls this out by name.
   */
  it('tells apart two content-hash urls of identical length', () => {
    const a = '/storage/catalog/leaves/lattice/image-307e06a9.webp';
    const b = '/storage/catalog/leaves/lattice/image-abd6e34e.webp';
    expect(a.length).toBe(b.length);
    expect(sourceKey(a)).not.toBe(sourceKey(b));
  });

  it('keeps a url intact, since a url is short', () => {
    const url = '/storage/catalog/trims/a-m1k2j3/trim-9f3ab21c.webp';
    expect(sourceKey(url)).toBe(url);
  });

  it('does not carry a whole data url into the key', () => {
    const big = 'data:image/jpeg;base64,' + 'A'.repeat(200_000);
    expect(sourceKey(big).length).toBeLessThan(400);
  });

  it('separates two data urls of different length', () => {
    const head = 'data:image/jpeg;base64,' + 'A'.repeat(600);
    const tail = 'B'.repeat(600);
    expect(sourceKey(head + 'X' + tail)).not.toBe(sourceKey(head + 'YZ' + tail));
  });

  /*
   * The known limit, stated rather than hidden: two data urls of the SAME
   * length differing only in their middle collide. That is the trade for not
   * hashing a megabyte on every drag frame of a bench preview, and it is safe
   * where it applies — a preview's boxes are part of the key too, and a
   * published source is a url, which is compared whole.
   */
  it('collides on same-length data urls that differ only in the middle', () => {
    const head = 'data:image/jpeg;base64,' + 'A'.repeat(600);
    const tail = 'B'.repeat(600);
    expect(sourceKey(head + 'X' + tail)).toBe(sourceKey(head + 'Y' + tail));
  });
});
