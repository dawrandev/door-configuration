import { describe, expect, it } from 'vitest';
import { homography, type Pt } from './rectify';

/**
 * The perspective solve, pinned.
 *
 * `homography` is hand-rolled Gaussian elimination with partial pivoting. It
 * has no library behind it and no visible failure mode: a regression here does
 * not throw, it keystones every door in the catalogue by a few per cent — the
 * exact defect the pipeline was written to remove ("the first one measured 6.4%
 * wider at the top than the bottom, a keystone the eye reads as 'crooked in its
 * frame' without being able to name it", tools/leaves.mjs).
 *
 * The property asserted is the one that defines the function: the eight
 * coefficients must map the output rectangle's own four corners back onto the
 * four source corners that were handed in. If that holds, the warp is correct
 * by construction.
 */

/** Apply the solved coefficients to an output point, per rectify()'s sampler. */
function project(h: number[], X: number, Y: number): Pt {
  const d = h[6] * X + h[7] * Y + 1;
  return { x: (h[0] * X + h[1] * Y + h[2]) / d, y: (h[3] * X + h[4] * Y + h[5]) / d };
}

function expectRoundTrip(src: [Pt, Pt, Pt, Pt], OW: number, OH: number, precision = 9) {
  const h = homography(src, OW, OH);
  const corners: [number, number][] = [[0, 0], [OW, 0], [OW, OH], [0, OH]];
  corners.forEach(([X, Y], i) => {
    const p = project(h, X, Y);
    expect(p.x).toBeCloseTo(src[i].x, precision);
    expect(p.y).toBeCloseTo(src[i].y, precision);
  });
  return h;
}

describe('homography', () => {
  /** A real keystone: the top edge wider than the bottom, which is what a
   *  photograph taken slightly below the door's centre actually looks like. */
  it('maps the output rectangle back onto a keystoned source quad', () => {
    expectRoundTrip(
      [{ x: 120, y: 80 }, { x: 880, y: 96 }, { x: 840, y: 1500 }, { x: 160, y: 1480 }],
      760,
      1400
    );
  });

  /** Rotation with no perspective — the projective terms should come out at
   *  (near) zero rather than absorbing the rotation into a division. */
  it('handles a quad that is only rotated, with no perspective', () => {
    const h = expectRoundTrip(
      [{ x: 100, y: 100 }, { x: 500, y: 140 }, { x: 460, y: 540 }, { x: 60, y: 500 }],
      400,
      400
    );
    expect(h[6]).toBeCloseTo(0, 6);
    expect(h[7]).toBeCloseTo(0, 6);
  });

  /** The degenerate-but-legal case: the quad already IS the output rect, so
   *  the solve must return the identity rather than something merely close. */
  it('returns the identity for a quad that is already square-on', () => {
    const h = homography([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 400 }, { x: 0, y: 400 }], 200, 400);
    expect(h.map((n) => Number(n.toFixed(10)))).toEqual([1, 0, 0, 0, 1, 0, 0, 0]);
  });

  /**
   * Partial pivoting earns its keep here. The first column of the system is
   * built from the destination corners, and the first destination corner is
   * (0, 0) — so row 0 starts with a zero pivot on every single call. Without
   * the row swap this function would divide by zero for every door ever
   * traced, so this is not a corner case, it is the normal path.
   */
  it('survives the zero leading pivot every call starts with', () => {
    const h = expectRoundTrip(
      [{ x: 5, y: 7 }, { x: 300, y: 2 }, { x: 310, y: 405 }, { x: 1, y: 399 }],
      300,
      400
    );
    for (const n of h) expect(Number.isFinite(n)).toBe(true);
  });
});
