import type { Lang, WallCategory } from '../i18n/strings';

export type Tr = Record<Lang, string>;

/** Rect in canvas pixels — see tokens.ts CANVAS. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WallScene {
  id: string;
  cat: WallCategory;
  name: Tr;
  /** Empty until we have wall photography; the swatch stands in. See walls.ts. */
  image: string;
  /** Where the door goes, in canvas pixels. */
  opening: Rect;
  swatch: string;
}

/**
 * Geometry class drives compatibility. A flush leaf has no panel field to carve
 * and no rail to hang glass in; a glazed leaf has no room for either.
 */
export type GeometryClass = 'panelled' | 'flush' | 'glazed';

/**
 * The naqsh is milled INTO the leaf — it is geometry, not an overlay, so it
 * cannot be swapped at runtime and is not an axis. Choosing a naqsh IS choosing
 * a model. SPEC §5 lists `pattern` as a tintable layer above `leaf_base`, which
 * is right for an applied ornament and wrong for a carved one; ours are carved.
 *
 * This costs nothing on colour — the carving's shading lives in the ao/spec
 * passes, so tinting the leaf repaints the carving with it, exactly as
 * repainting a real carved door would.
 */
export type Naqsh = 'none' | 'hexagon' | 'lattice' | 'inlay' | 'rosette';

/** A tintable photographic part: four pixel-aligned passes. */
export interface Passes {
  base: string;
  ao: string;
  spec: string;
  mask: string;
}

export interface Hardware {
  file: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DoorModel {
  id: string;
  sku: string;
  name: Tr;
  geometry: GeometryClass;
  naqsh: Naqsh;
  /** Which way it swings. Both hands are real product; we do not mirror art. */
  hinge: 'left' | 'right';
  basePrice: number;
  /** The leaf, at CANON size. Every model's leaf is the same size. */
  leaf: Passes;
  /**
   * Frosted glass insert, pixel-aligned with the leaf and composited over it
   * WITHOUT tinting — glass is a material, not paint, so it stays translucent
   * whatever colour the door body takes. Absent on solid doors.
   */
  glassLayer?: string;
  /** Black anodised metal, composited on top and never tinted. */
  hardware: Hardware[];
  /** Which frames this leaf may wear. Invalid pairs never reach the UI. */
  allows: {
    frames: string[];
    glass: string[];
  };
}

/**
 * The architrave. A separate manufactured part that never shares a pixel with
 * the leaf, which is exactly why it can be an axis when the naqsh cannot: once
 * every frame's inner opening is normalised to CANON, any frame composites onto
 * any leaf with no combination photography.
 */
export interface FrameModel {
  id: string;
  name: Tr;
  style: string;
  passes: Passes;
  /** Outer size, and where the leaf sits inside it — both in canon pixels. */
  width: number;
  height: number;
  inner: { left: number; top: number; width: number; height: number };
  priceDelta: number;
}

export type FinishType = 'solid' | 'wood';

export interface Finish {
  id: string;
  name: Tr;
  type: FinishType;
  /** solid → hex fed to the shader as a tint. wood → tiled texture. */
  tint?: string;
  texture?: string;
  /** Gloss keeps its highlights; matte gives them up. Feeds uSpecGain. */
  specGain: number;
  swatch: string;
  priceDelta: number;
}

export interface Glass {
  id: string;
  name: Tr;
  asset: string | null;
  reflection: string | null;
  swatch: string;
  priceDelta: number;
}

export interface Catalog {
  walls: WallScene[];
  doors: DoorModel[];
  frames: FrameModel[];
  finishes: Finish[];
  glass: Glass[];
}

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
   * The room's own light as an RGB multiplier (≈1). The stage tints the door
   * with it so a neutral-white leaf takes on the room's warmth instead of
   * reading as a cold cut-out pasted over warm walls.
   */
  light: [number, number, number];
}
