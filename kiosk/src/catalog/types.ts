import type { Lang } from '../i18n/strings';

export type Tr = Record<Lang, string>;

/**
 * A door leaf, cut from a photograph and squared up by tools/leaves.mjs.
 *
 * There is no tint, no pass stack and no frame: the leaf is the photograph of
 * the real product, and the room supplies the casing it stands in. That is the
 * whole model, and it is why the composite reads as photographed.
 */
export interface Leaf {
  id: string;
  name: Tr;
  image: string;
  /** the leaf's own measured proportion — width / height */
  aspect: number;
  handleSide: 'left' | 'right';
  /** false when the leaf still wears the handle it was photographed with */
  handleSwappable: boolean;
  /**
   * Where the handle sits, as fractions of the leaf — the centre of the box the
   * pipeline stripped. Absent on a leaf that kept its own handle.
   */
  handleAt?: { x: number; y: number };
  /**
   * The bench needs these to REOPEN a door and re-cut it: a compact source
   * photograph, the four corners marked on it (fractions), and the choices made.
   * Present on built-in doors too — a small extra asset, loaded only when the
   * door is edited — so the first four are as editable as any added later.
   */
  source?: string;
  corners?: { x: number; y: number }[];
  white?: boolean;
  handleChoice?: 'left' | 'right' | 'none';
  /**
   * Regions the recolour must NOT touch, as fractions of the leaf: the handle
   * it was photographed with, a brass medallion, the maker's logo. Hardware is
   * not paint — recolor.ts pastes the original pixels back over these boxes.
   */
  keep?: { x: number; y: number; w: number; h: number }[];
  /**
   * Which colours (catalog/colors.ts ids) this model is actually sold in.
   * Absent means every colour in the registry applies — the safe default,
   * since it is what every door had before a product needed its own list.
   * `'oq'` (as photographed) is never restricted by this: it isn't a paint.
   */
  colorIds?: string[];
  /**
   * Which nalichnik/korona pieces this door model comes with, by role. A
   * room's trim is measured once, against its own photograph — this doesn't
   * change which pieces PHYSICALLY exist in that photo, only which of them
   * take paint when THIS door is standing in it. A flush modern door might
   * come with just the shaft ring; a classical one might come with the ring,
   * a crown, and both feet, even in the exact same room. Absent means every
   * piece the room has applies — the same "no restriction" default `colorIds`
   * uses, and what every door had before this was an axis. A trim piece with
   * no `role` of its own (older, unlabelled data) is never filtered by this —
   * it always applies, since there's nothing to match it against.
   */
  trimRoles?: TrimRole[];
}

/**
 * A trim piece's role — which part of the architrave it is. Shared between
 * `Room.trimBoxes[].role` (what a piece actually is) and `Leaf.trimRoles`
 * (which of those a given door comes with).
 */
export type TrimRole = 'shaft' | 'crown' | 'footL' | 'footR' | 'extra';

/** One piece of nalichnik/korona trim, in fractions of whatever photo it was
 *  measured against — a room's, or (see `Leaf.trimBoxes`) a door's own. */
export interface TrimPiece {
  x: number; y: number; w: number; h: number;
  /** The piece's ACTUAL outline (a closed polygon, wound clockwise from
   *  top-left) — wins over the plain rectangle above when present. A
   *  moulded crown is rarely a clean box. */
  points?: { x: number; y: number }[];
  /** A second, separately traced outline — the piece's inner edge, cut out
   *  of the first. See the long-form note on `Room.trimBoxes` for why this
   *  can't just be inferred from the doorway rectangle. */
  holePoints?: { x: number; y: number }[];
  /** What this piece IS. Optional only for older, unmeasured-by-role data —
   *  a piece with no role is never excluded by a door's `trimRoles`. */
  role?: TrimRole;
  label?: string;
}

/**
 * A nalichnik/korona DESIGN, independently choosable — not tied to any one
 * room or door. Authored the same way as `Leaf`'s own trim (`admin/TrimBench.tsx`
 * is a trimmed-down clone of `DoorBench`'s own-trim tracer): a photo, four
 * corners marking a notional "opening" rectangle within it (also flattening
 * the photo if it was shot at a slight angle, via the same `rectify()`
 * homography a door's corners use), a margin revealing the casing around
 * that rectangle, and pieces traced on the result.
 *
 * Deliberately its own type rather than sharing one with `Leaf`'s three trim
 * fields — same shape, kept separate so nothing about `Leaf` has to change.
 */
export interface TrimModel {
  id: string;
  name: Tr;
  /** Which independent client-facing pick this design belongs to — a
   *  nalichnik-family piece (shaft/foot/extra) or a korona (crown) piece.
   *  Doors and rooms don't choose this; the customer does, on its own
   *  step, entirely independent of which door or room is showing. */
  category: 'nalichnik' | 'korona';
  /** Fractions of the marked opening rect's own width/height — same meaning
   *  as the door's own trim used to have. */
  trimMargin: { left: number; right: number; top: number; bottom: number };
  trimBoxes: TrimPiece[];
  /** The padded, rectified (flat) photo `trimBoxes` are measured against and
   *  rendered from — same role as `Leaf.trimSource`. */
  trimSource: string;
}

/**
 * A door handle finish. One dead-on cutout, recoloured — see tools/leaves.mjs.
 * It is placed on a leaf at that leaf's `handleAt`, mirrored to `handleSide`.
 */
export interface Handle {
  id: string;
  name: Tr;
  image: string;
}

/**
 * A room, with the doorway it already has.
 *
 * The doorway is EMPTY — tools/rooms.mjs replaces the render's own door with an
 * unlit recess — so a leaf dropped into it covers dark, not another door's
 * bright white edge. That is what removed the halo.
 */
export interface Room {
  id: string;
  name: Tr;
  /** the stage image: doorway replaced by an unlit recess for a door to fill */
  image: string;
  /** the chooser image: the untouched photo, door and all — no black recess */
  thumb?: string;
  /** the photograph's own proportion — width / height */
  aspect: number;
  /** the doorway, as fractions of the image */
  open: { x: number; y: number; w: number; h: number };
  /**
   * The nalichnik — every piece of architrave trim that takes the door's paint,
   * as a list of rectangles in image fractions. A real moulded surround is
   * rarely one clean rectangle: the shaft ring around the opening, a crown
   * above it, a flared foot block where a pilaster meets the floor — each is
   * its own box here. recolor.ts crops their shared bounding box, derives ONE
   * set of lighting passes over it (so pieces that meet — a foot against its
   * shaft — read as continuous trim, not two independently-lit patches), then
   * paints each box back, subtracting `open` from whichever ones overlap it.
   * Measured per room, by eye against the photograph; absent rooms simply
   * keep a white casing. A flush/modern room may need only one box (the ring);
   * a classical one typically needs the ring, a crown, and two foot blocks.
   *
   * `x,y,w,h` is always present — the piece's bounding box, used for the
   * shared-derivation crop and as a fallback shape. `points`, when present,
   * is the piece's ACTUAL outline (a closed polygon, image fractions,
   * wound clockwise from top-left) and wins over the plain rectangle — a
   * moulded crown is rarely a clean box, and a rectangle over it paints the
   * wall on either side along with the moulding.
   *
   * `holePoints`, when present, is a SECOND traced outline — the piece's
   * inner edge, cut out of the first. A ring-shaped piece (the shaft is the
   * usual case) is not reliably just "outer polygon minus the doorway": the
   * doorway rectangle is a guess at where the opening is, not a measurement
   * of where the casing's own inner lip actually sits in the photograph, and
   * a photo shot at any angle lets the two disagree by a visible sliver.
   * `open` is still subtracted afterward regardless, as a floor that keeps
   * the door itself from ever taking paint — `holePoints` is what lets the
   * inner edge be traced to match the real photograph instead of trusting
   * that guess.
   */
  trimBoxes?: TrimPiece[];
  /**
   * The bench needs this to REOPEN a room and re-mark its doorway/trim — the
   * same reason Leaf keeps `source`. `thumb` already IS this photo (untouched,
   * full quality) for every built-in room, so it costs nothing to point here.
   */
  source?: string;
  /**
   * The room's own light as an RGB multiplier (≈1). The stage tints the door
   * with it so a neutral-white leaf takes on the room's warmth instead of
   * reading as a cold cut-out pasted over warm walls.
   */
  light: [number, number, number];
}
