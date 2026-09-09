import { describe, expect, it } from 'vitest';
import {
  authoredHalf, bboxOfPoints, defaultRectFor, distToSegment, insertIndexForPoint,
  isSymmetric, mirrorPoint, nearestLoop, rotateToLeftRun, seedPoints,
  symmetrise, toSymmetric,
  toStoredTrim, toTrimState, type Point, type TrimPieceState,
} from './trimGeometry';

/**
 * The trim-piece geometry, pinned.
 *
 * This module exists because the maths was once duplicated across two benches
 * and only one copy got a fix (see its own docblock). These tests are the other
 * half of that guarantee: one implementation, and one description of what it
 * is supposed to do.
 */

const rect = { x: 0.2, y: 0.1, w: 0.5, h: 0.6 };

/** Rects are compared field-wise, never with toEqual: `bboxOfPoints` derives
 *  w/h by subtraction, so a rect that went through `seedPoints` comes back as
 *  0.49999999999999994 rather than 0.5. That is correct floating-point
 *  behaviour, not drift, and the bench renders both identically. */
function expectRect(got: { x: number; y: number; w: number; h: number }, want: { x: number; y: number; w: number; h: number }) {
  expect(got.x).toBeCloseTo(want.x, 12);
  expect(got.y).toBeCloseTo(want.y, 12);
  expect(got.w).toBeCloseTo(want.w, 12);
  expect(got.h).toBeCloseTo(want.h, 12);
}

describe('bboxOfPoints / seedPoints', () => {
  /** The two are inverses over a rectangle, which is what lets a piece keep
   *  `rect` in sync with a freely-dragged `points` without drifting. */
  it('round-trips a rectangle through its own corners', () => {
    expectRect(bboxOfPoints(seedPoints(rect)), rect);
  });

  it('wraps an arbitrary polygon in its smallest containing rect', () => {
    const box = bboxOfPoints([{ x: 0.4, y: 0.9 }, { x: 0.1, y: 0.3 }, { x: 0.8, y: 0.5 }]);
    expectRect(box, { x: 0.1, y: 0.3, w: 0.7, h: 0.6 });
  });

  it('seeds clockwise from the top-left', () => {
    expect(seedPoints({ x: 0, y: 0, w: 1, h: 1 })).toEqual([
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
    ]);
  });
});

describe('distToSegment', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 0 };

  it('measures perpendicular distance to the middle of a segment', () => {
    expect(distToSegment({ x: 5, y: 3 }, a, b)).toBeCloseTo(3, 12);
  });

  /** Clamped, not projected onto the infinite line: a click past the end of an
   *  edge belongs to the endpoint, or it would insert points off the shape. */
  it('clamps past either end rather than using the infinite line', () => {
    expect(distToSegment({ x: -4, y: 0 }, a, b)).toBeCloseTo(4, 12);
    expect(distToSegment({ x: 16, y: 0 }, a, b)).toBeCloseTo(6, 12);
  });

  /** Two stacked points make a zero-length edge; `len2 === 0` must not divide. */
  it('returns a finite distance for a zero-length segment', () => {
    const d = distToSegment({ x: 3, y: 4 }, a, a);
    expect(d).toBeCloseTo(5, 12);
    expect(Number.isFinite(d)).toBe(true);
  });
});

describe('insertIndexForPoint', () => {
  const square = seedPoints({ x: 0, y: 0, w: 1, h: 1 });

  /** A click near the top edge inserts between its two endpoints, so the
   *  outline keeps its shape instead of the new point being tacked on the end. */
  it('inserts on the edge the click landed nearest', () => {
    expect(insertIndexForPoint(square, { x: 0.5, y: -0.05 })).toBe(1);
    expect(insertIndexForPoint(square, { x: 1.05, y: 0.5 })).toBe(2);
  });

  /** The closing edge runs from the last point back to the first, so its
   *  insert index is the array's length. */
  it('inserts at the end for the closing edge', () => {
    expect(insertIndexForPoint(square, { x: -0.05, y: 0.5 })).toBe(square.length);
  });

  it('appends when there is not yet an edge to measure', () => {
    expect(insertIndexForPoint([], { x: 0, y: 0 })).toBe(0);
    expect(insertIndexForPoint([{ x: 0, y: 0 }], { x: 1, y: 1 })).toBe(1);
  });
});

describe('nearestLoop', () => {
  const piece = (holePoints?: { x: number; y: number }[]): TrimPieceState => ({
    id: 'p', role: 'shaft', rect: { x: 0, y: 0, w: 1, h: 1 },
    points: seedPoints({ x: 0, y: 0, w: 1, h: 1 }),
    holePoints,
  });
  const hole = seedPoints({ x: 0.4, y: 0.4, w: 0.2, h: 0.2 });

  it('picks the outer loop when there is no hole at all', () => {
    expect(nearestLoop(piece(), { x: 0.5, y: 0.5 }).loop).toBe('points');
  });

  it('picks the hole when the click is nearer to it', () => {
    expect(nearestLoop(piece(hole), { x: 0.5, y: 0.38 }).loop).toBe('holePoints');
  });

  it('picks the outer loop when the click is nearer to that', () => {
    expect(nearestLoop(piece(hole), { x: 0.5, y: 0.02 }).loop).toBe('points');
  });
});

describe('toStoredTrim / toTrimState', () => {
  it('carries the outline, hole, role and label through a round trip', () => {
    const state: TrimPieceState = {
      id: 'a', role: 'crown', label: 'Korona',
      rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
      points: seedPoints({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }),
      holePoints: seedPoints({ x: 0.15, y: 0.25, w: 0.2, h: 0.3 }),
    };
    const back = toTrimState('a', toStoredTrim(state));
    expect(back).toEqual(state);
  });

  /**
   * Older data, saved before free points existed, has no `points` at all. It
   * must open as four draggable corners seeded from its rect rather than
   * erroring — this is the compatibility path every room measured before that
   * feature still takes.
   */
  it('seeds an outline from the rect when stored data has none', () => {
    const state = toTrimState('a', { x: 0.2, y: 0.1, w: 0.5, h: 0.6, role: 'shaft' });
    expect(state.points).toEqual(seedPoints(rect));
    expect(state.holePoints).toBeUndefined();
  });

  /** A degenerate loop is not a shape. Fewer than 3 points is discarded rather
   *  than passed to the fill rule, which would paint something arbitrary. */
  it('discards outlines and holes with fewer than three points', () => {
    const state = toTrimState('a', {
      ...rect,
      points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      holePoints: [{ x: 0.4, y: 0.4 }, { x: 0.5, y: 0.5 }],
    });
    expect(state.points).toEqual(seedPoints(rect));
    expect(state.holePoints).toBeUndefined();
  });

  /** An unlabelled piece from before roles existed defaults to 'extra', which
   *  is the role a door's `trimRoles` filter never excludes. */
  it('defaults a role-less piece to extra', () => {
    expect(toTrimState('a', rect).role).toBe('extra');
  });
});

describe('defaultRectFor', () => {
  const ref = { x: 0.3, y: 0.15, w: 0.4, h: 0.75 };

  /** The shaft opens slightly outside the doorway — it is the casing AROUND
   *  the opening, so a seed that sat inside it would start on the door. */
  it('opens the shaft just outside the reference opening', () => {
    const shaft = defaultRectFor('shaft', ref, []);
    expect(shaft.x).toBeLessThan(ref.x);
    expect(shaft.y).toBeLessThan(ref.y);
    expect(shaft.w).toBeGreaterThan(ref.w);
  });

  /** Crown and feet are placed against the SHAFT once one exists, not against
   *  the opening — that is what keeps a crown sitting on its own casing. */
  it('places the crown above whatever shaft is already traced', () => {
    const shaft: TrimPieceState = {
      id: 's', role: 'shaft', rect: { x: 0.25, y: 0.2, w: 0.5, h: 0.7 },
      points: seedPoints({ x: 0.25, y: 0.2, w: 0.5, h: 0.7 }),
    };
    const crown = defaultRectFor('crown', ref, [shaft]);
    expect(crown.x).toBe(shaft.rect.x);
    expect(crown.w).toBe(shaft.rect.w);
    expect(crown.y).toBeLessThan(shaft.rect.y);
  });

  it('puts the two feet on opposite sides of the shaft', () => {
    const shaft: TrimPieceState = {
      id: 's', role: 'shaft', rect: { x: 0.25, y: 0.2, w: 0.5, h: 0.7 },
      points: seedPoints({ x: 0.25, y: 0.2, w: 0.5, h: 0.7 }),
    };
    const l = defaultRectFor('footL', ref, [shaft]);
    const r = defaultRectFor('footR', ref, [shaft]);
    expect(l.x).toBeLessThan(r.x);
    expect(l.y).toBeCloseTo(r.y, 12);
  });

  /** Every role must produce a rect — a missing branch would return undefined
   *  and the bench would open a piece with no shape to drag. */
  it('produces a rect for every role', () => {
    for (const role of ['shaft', 'crown', 'footL', 'footR', 'extra'] as const) {
      const out = defaultRectFor(role, ref, []);
      expect(out.w).toBeGreaterThan(0);
      expect(out.h).toBeGreaterThan(0);
    }
  });
});

/**
 * Mirror symmetry — one half authored, the other generated.
 *
 * The index maths is where this would go wrong quietly: a mirror partner found
 * one place off drags the wrong handle, and the outline only looks wrong once
 * it is published.
 */
describe('symmetry', () => {
  const AX = 0.5;
  /** A crown's left half: along the top, down the moulding, out to the foot. */
  const half: Point[] = [
    { x: 0.10, y: 0.05 },
    { x: 0.18, y: 0.14 },
    { x: 0.22, y: 0.30 },
    { x: 0.22, y: 0.60 },
  ];

  it('reflects a point across the axis', () => {
    expect(mirrorPoint({ x: 0.2, y: 0.4 }, 0.5)).toEqual({ x: 0.8, y: 0.4 });
    // A point ON the axis is its own reflection.
    expect(mirrorPoint({ x: 0.5, y: 0.4 }, 0.5)).toEqual({ x: 0.5, y: 0.4 });
  });

  it('closes the loop by reversing the mirrored half', () => {
    const full = symmetrise(half, AX);
    expect(full).toHaveLength(8);
    // The authored half leads, unchanged.
    expect(full.slice(0, 4)).toEqual(half);
    // The tail runs BACK up the other side: the last authored point mirrors to
    // the first generated one. Appended in the same order it would cross over
    // itself instead of closing.
    expect(full[4]).toEqual({ x: 0.78, y: 0.60 });
    expect(full[7]).toEqual({ x: 0.90, y: 0.05 });
  });

  it('never duplicates a point that sits on the axis', () => {
    const withApex = [...half, { x: AX, y: 0.02 }];
    const full = symmetrise(withApex, AX);
    expect(full).toHaveLength(9);
    expect(full.filter((p) => Math.abs(p.x - AX) < 1e-9)).toHaveLength(1);
  });

  it('reads the authored half back out of the whole outline', () => {
    expect(authoredHalf(symmetrise(half, AX), AX)).toEqual(half);
  });

  it('recognises an outline it built, and refuses one it did not', () => {
    const full = symmetrise(half, AX);
    expect(isSymmetric(full, AX)).toBe(true);
    // A hand-traced near-miss must NOT be treated as symmetric: switching the
    // mode on rewrites the outline, and doing that silently would move points
    // the operator placed deliberately.
    const nudged = full.map((p, i) => (i === 6 ? { x: p.x + 0.01, y: p.y } : p));
    expect(isSymmetric(nudged, AX)).toBe(false);
    // A plain rectangle is symmetric about its own centre, even though
    // seedPoints starts at the top-LEFT and so splits its two left points
    // across the ends of the array.
    expect(isSymmetric(seedPoints({ x: 0.2, y: 0.1, w: 0.6, h: 0.4 }), 0.5)).toBe(true);
  });

  it('rotates an arbitrary starting point onto the left run', () => {
    const box = seedPoints({ x: 0.2, y: 0.1, w: 0.6, h: 0.4 });
    const turned = rotateToLeftRun(box, 0.5)!;
    expect(turned.slice(0, 2).every((p) => p.x <= 0.5)).toBe(true);
    expect(turned).toHaveLength(box.length);
  });

  it('refuses an outline that crosses the axis more than twice', () => {
    // A zig-zag: left, right, left, right. There is no single half to author.
    const zig = [
      { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.2 },
      { x: 0.1, y: 0.3 }, { x: 0.9, y: 0.4 },
    ];
    expect(rotateToLeftRun(zig, 0.5)).toBeNull();
    expect(toSymmetric(zig, 0.5)).toBeNull();
    expect(isSymmetric(zig, 0.5)).toBe(false);
  });

  it('makes a hand-traced near-miss exactly symmetric', () => {
    const full = symmetrise(half, AX);
    const wobbly = full.map((p, i) => (i === 6 ? { x: p.x + 0.01, y: p.y - 0.004 } : p));
    expect(isSymmetric(wobbly, AX)).toBe(false);
    const fixed = toSymmetric(wobbly, AX)!;
    expect(isSymmetric(fixed, AX)).toBe(true);
    // The authored half is what survives; the wobble was on the generated side.
    expect(authoredHalf(fixed, AX)).toEqual(half);
  });

  it('is idempotent, so reopening a symmetric piece changes nothing', () => {
    const full = symmetrise(half, AX);
    expect(symmetrise(authoredHalf(full, AX), AX)).toEqual(full);
  });
});
