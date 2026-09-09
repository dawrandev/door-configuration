import type { Rect } from './roomProcess';
import type { TrimPiece, TrimRole } from '../catalog/types';

/**
 * The trim-piece geometry both benches edit — a room's architrave (against
 * its own photo) and a door's own nalichnik (against its own, once traced).
 * Kept in ONE place because the alternative already happened once this
 * session: two copies of this maths that only looked identical until one of
 * them needed a fix and the other didn't get it.
 */

export interface Point { x: number; y: number }

export interface TrimPieceState {
  id: string;
  role: TrimRole;
  label?: string;
  /** The piece's bounding box — kept in sync as the bbox of `points`.
   *  recolorTrim's shared-crop and the HUD both read this regardless of the
   *  actual outline. */
  rect: Rect;
  /** The piece's real outline, wound clockwise from top-left, image
   *  fractions. Always at least 4 points and always independently draggable
   *  — a moulded crown is rarely a clean box, so trim was never really a
   *  rectangle to begin with; it only looked like one because it started as
   *  4 points at a rectangle's corners. Dragging one point moves ONLY that
   *  point. */
  points: Point[];
  /** An optional, separately hand-traced inner edge — a cutout, for a piece
   *  shaped like a ring (the shaft, almost always). */
  holePoints?: Point[];
  /** Author one half and mirror the other. An editing mode, not a property of
   *  the piece: `points` still holds the whole outline, so nothing that reads
   *  a stored piece needs to know, and `toStoredTrim` drops this. */
  mirror?: boolean;
}

/** The smallest rect containing every point — `points`' bounding box. */
export function bboxOfPoints(points: Point[]): Rect {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
}

/** A rect's four corners as a closed polygon, tl→tr→br→bl — the winding a
 *  simple (non-self-crossing) outline needs. Seeds a fresh piece's outline
 *  from whatever rect it started as, so it never opens blank. */
export function seedPoints(rect: Rect): Point[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h },
  ];
}

/*
 * Mirror symmetry.
 *
 * A korona is a moulding centred over the door: it IS symmetric, and the four
 * corners have already squared the photograph up, so it should be symmetric in
 * the picture too. Tracing both halves by hand is twice the work and never
 * lands — measured on one real trace, the two sides mirrored to within 1–5px
 * on an 1853px canvas, which is the hand, not the moulding.
 *
 * So one half is authored and the other is generated. Nothing downstream
 * learns about it: `points` always holds the WHOLE outline, and a symmetric
 * piece is stored, validated and rendered exactly like any other.
 */

/** How close to the axis counts as "on it" — such a point is its own mirror
 *  and must not be duplicated. */
const AXIS_EPS = 1e-4;

/** Reflect a point across the vertical line x = axis. */
export const mirrorPoint = (p: Point, axis: number): Point => ({ x: 2 * axis - p.x, y: p.y });

/**
 * The canonical form of a symmetric outline: the authored half, then that half
 * reversed and reflected.
 *
 * Reversed, because a polygon is a loop — appending the mirror in the same
 * order would run back over itself and cross. Reversed, the outline goes down
 * one side and back up the other, which is the shape a crown actually is.
 *
 * The half is always the LEFT one, so the leading run of the result is always
 * the authored part. That invariant is what lets the editor show handles for
 * indices 0..half-1 and rebuild from them, with no pairing to keep in step.
 */
export function symmetrise(half: Point[], axis: number): Point[] {
  const mirrored = half
    .slice()
    .reverse()
    .filter((p) => Math.abs(p.x - axis) > AXIS_EPS)
    .map((p) => mirrorPoint(p, axis));
  return [...half, ...mirrored];
}

/** The authored half of a canonical symmetric outline — the leading run of
 *  points at or left of the axis. */
export function authoredHalf(points: Point[], axis: number): Point[] {
  const end = points.findIndex((p) => p.x > axis + AXIS_EPS);
  return end === -1 ? points : points.slice(0, end);
}

/**
 * Rotate an outline so its left-hand points lead, which is what everything
 * above assumes.
 *
 * A loop has no first point, and where a trace happens to have started is
 * arbitrary — `seedPoints` begins at the top-LEFT and runs clockwise, so its
 * two left points end up at indices 0 and 3, split across the ends of the
 * array even though they are neighbours on the loop.
 *
 * Null when the left points are not one run around the loop: an outline that
 * crosses the axis more than twice has no "half" to author, and mirroring it
 * would mean guessing which crossing was meant.
 */
export function rotateToLeftRun(points: Point[], axis: number): Point[] | null {
  const isLeft = points.map((p) => p.x <= axis + AXIS_EPS);
  const n = points.length;
  if (isLeft.every(Boolean) || !isLeft.some(Boolean)) return null;
  // Exactly one place where a right point is followed by a left one — any more
  // and the loop crosses the axis more than twice.
  const starts = points.map((_, i) => i).filter((i) => isLeft[i] && !isLeft[(i - 1 + n) % n]);
  if (starts.length !== 1) return null;
  const s = starts[0];
  return [...points.slice(s), ...points.slice(0, s)];
}

/**
 * Is this outline already a mirror of itself about the axis?
 *
 * Used to reopen a symmetric piece back in symmetric mode rather than making
 * the operator notice and switch it on again. Deliberately exact-ish: this
 * asks "was this authored symmetrically", not "is this roughly symmetric",
 * because turning the mode on rewrites the outline and a hand-traced near-miss
 * would be silently altered.
 */
export function isSymmetric(points: Point[], axis: number, eps = 1e-3): boolean {
  if (points.length < 4) return false;
  const turned = rotateToLeftRun(points, axis);
  if (!turned) return false;
  const half = authoredHalf(turned, axis);
  if (half.length < 2) return false;
  const rebuilt = symmetrise(half, axis);
  return rebuilt.length === turned.length
    && rebuilt.every((p, i) => Math.abs(p.x - turned[i].x) < eps && Math.abs(p.y - turned[i].y) < eps);
}

/**
 * An outline put into symmetric form: rotated so the left half leads, then
 * rebuilt from that half. This is what switching the mode on does.
 *
 * Null when the outline has no single left run to author from — the caller
 * says so rather than silently mirroring about a crossing nobody chose.
 */
export function toSymmetric(points: Point[], axis: number): Point[] | null {
  const turned = rotateToLeftRun(points, axis);
  if (!turned) return null;
  const half = authoredHalf(turned, axis);
  return half.length >= 2 ? symmetrise(half, axis) : null;
}

/** Perpendicular distance from p to the segment a–b (clamped to the segment). */
export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Where a new point belongs: on the edge it lands closest to, so a click
 * anywhere near the outline inserts right there rather than tacking a point
 * onto the end and scrambling the shape. With fewer than two points yet,
 * there is no edge to measure — just append.
 */
export function insertIndexForPoint(points: Point[], p: Point): number {
  if (points.length < 2) return points.length;
  let bestI = points.length, bestD = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = distToSegment(p, points[i], points[(i + 1) % points.length]);
    if (d < bestD) { bestD = d; bestI = i + 1; }
  }
  return bestI;
}

/**
 * Which loop a click lands closest to — a piece's outer edge, or its inner
 * hole when it has one — and where on that loop the new point belongs.
 * Shared by every bench that lets a piece carry both: comparing the two
 * distances is the whole trick, and it only needs writing once.
 */
export function nearestLoop(active: TrimPieceState, p: Point): { loop: 'points' | 'holePoints'; index: number } {
  const outerIdx = insertIndexForPoint(active.points, p);
  const outerDist = distToSegment(p, active.points[(outerIdx - 1 + active.points.length) % active.points.length], active.points[outerIdx % active.points.length]);
  const hole = active.holePoints;
  const holeIdx = hole ? insertIndexForPoint(hole, p) : -1;
  const holeDist = hole ? distToSegment(p, hole[(holeIdx - 1 + hole.length) % hole.length], hole[holeIdx % hole.length]) : Infinity;
  return hole && holeDist < outerDist ? { loop: 'holePoints', index: holeIdx } : { loop: 'points', index: outerIdx };
}

/** A reasonable starting rectangle for a role, so a chip click drops a piece
 *  roughly where it belongs instead of a blank square to drag from scratch
 *  — the same shortcut hand-measuring these against real photos leaned on.
 *  `ref` is whatever the piece is measured relative to: a room's doorway, or
 *  a door's own leaf rect within its padded trim canvas. */
export function defaultRectFor(role: TrimRole, ref: Rect, trim: TrimPieceState[]): Rect {
  const shaft = trim.find((t) => t.role === 'shaft')?.rect ?? ref;
  switch (role) {
    case 'shaft':
      return { x: Math.max(0, ref.x - 0.03), y: Math.max(0, ref.y - 0.03), w: Math.min(1 - ref.x + 0.03, ref.w + 0.06), h: Math.min(1 - ref.y + 0.03, ref.h + 0.035) };
    case 'crown':
      return { x: shaft.x, y: Math.max(0, shaft.y - 0.05), w: shaft.w, h: 0.045 };
    case 'footL':
      return { x: Math.max(0, shaft.x - 0.015), y: Math.min(0.94, shaft.y + shaft.h - 0.05), w: 0.06, h: 0.05 };
    case 'footR':
      return { x: Math.min(0.94 - 0.06, shaft.x + shaft.w - 0.045), y: Math.min(0.94, shaft.y + shaft.h - 0.05), w: 0.06, h: 0.05 };
    case 'extra':
      return { x: 0.4, y: 0.4, w: 0.15, h: 0.1 };
  }
}

/** What a piece publishes: its bbox, its real outline, its inner cut when it
 *  has one, and its role right on the piece itself. */
export function toStoredTrim(t: TrimPieceState): TrimPiece {
  return { ...t.rect, points: t.points, holePoints: t.holePoints, role: t.role, label: t.label };
}

/** Build bench state from whatever was stored. Older data (saved before
 *  free points existed) has no `points` — seeded from its rect, same as a
 *  brand-new piece, so it opens as 4 draggable corners rather than erroring.
 *  `holePoints` stays undefined unless it was actually there — never
 *  assumed. `role`/`label` default from the piece itself; a caller
 *  reopening older data can override them from wherever that data actually
 *  kept them. */
export function toTrimState(id: string, box: TrimPiece, role: TrimRole = box.role ?? 'extra', label: string | undefined = box.label): TrimPieceState {
  const rect = { x: box.x, y: box.y, w: box.w, h: box.h };
  return {
    id, role, label, rect,
    points: box.points && box.points.length >= 3 ? box.points : seedPoints(rect),
    holePoints: box.holePoints && box.holePoints.length >= 3 ? box.holePoints : undefined,
  };
}
