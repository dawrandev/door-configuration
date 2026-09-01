import { useEffect, useState } from 'react';
import type { Leaf, Room } from '../catalog/types';
import type { Tint } from '../catalog/colors';

/**
 * Realistic recolouring, in the browser.
 *
 * A faithful port of tools/passes.mjs (base/ao/spec derivation) and the
 * tools/preview.mjs composite, so built-in and bench doors are recoloured by
 * ONE code path and the bench needs no server round-trip:
 *
 *   base = L / blur(L)   — divide the lighting out; what's left is albedo
 *   ao   = blur(L), normalised to its own p98 — pure occlusion, no paint
 *   spec = max(0, L − blur(L)·1.06) · 1.4 — the highlights, kept white
 *
 *   out = tint · base · ao + spec
 *
 * Why not CSS multiply: it blends in gamma space, tints the highlights and
 * double-darkens the shading — the "dipped in plastic" look that got colour
 * removed the first time. Decomposing first means the tint owns the albedo
 * alone; the photograph's shading and speculars are re-applied untouched.
 * Holds for matte paint, breaks on gloss — every leaf in the set is matte.
 *
 * Everything runs in Float32 and is encoded to 8-bit once, at the very end:
 * dark colours quantised through 8-bit intermediates band across a 2.5m door.
 * All math stays in the sRGB space the photograph and the palette share —
 * the same space the offline pipeline rehearsed in and was judged good.
 */

const LUMA = [0.2126, 0.7152, 0.0722];

/** One separable box pass, with a running sum and clamped edges. */
function boxBlur(src: Float32Array, dst: Float32Array, w: number, h: number, r: number, horizontal: boolean) {
  const n = horizontal ? h : w;
  const m = horizontal ? w : h;
  const stride = horizontal ? w : 1;
  const step = horizontal ? 1 : w;
  const inv = 1 / (2 * r + 1);
  for (let i = 0; i < n; i++) {
    const row = i * stride;
    const at = (j: number) => src[row + Math.max(0, Math.min(m - 1, j)) * step];
    let sum = 0;
    for (let j = -r; j <= r; j++) sum += at(j);
    for (let j = 0; j < m; j++) {
      dst[row + j * step] = sum * inv;
      sum += at(j + r + 1) - at(j - r);
    }
  }
}

/** Gaussian blur, in float, three box passes deep — never through 8 bits. */
function blurPlane(L: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const r = Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1) / 2));
  let a = Float32Array.from(L);
  const b = new Float32Array(L.length);
  for (let p = 0; p < 3; p++) {
    boxBlur(a, b, w, h, r, true);
    boxBlur(b, a, w, h, r, false);
  }
  return a;
}

interface Passes {
  w: number;
  h: number;
  BASE: Float32Array;
  AO: Float32Array;
  SPEC: Float32Array;
}

/**
 * Derive the passes from raw RGBA pixels. Sigma scales off the width so a leaf
 * and a casing crop get comparable treatment; the p98 normalisation takes the
 * photographed paint out of `ao` so the tint fully owns the colour.
 */
function derivePasses(rgb: Uint8ClampedArray, w: number, h: number, specGain = 0.55): Passes {
  const n = w * h;
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    L[i] = (LUMA[0] * rgb[i * 4] + LUMA[1] * rgb[i * 4 + 1] + LUMA[2] * rgb[i * 4 + 2]) / 255;
  }
  const s = Math.max(6, Math.round(w * 0.055));
  const lighting = blurPlane(L, w, h, s);

  const BASE = new Float32Array(n);
  for (let i = 0; i < n; i++) BASE[i] = Math.min(1.35, L[i] / Math.max(0.02, lighting[i]));

  // p98, not max: one blown pixel should not set the scale for the whole part.
  const sorted = lighting.slice().sort();
  const ref = Math.max(0.02, sorted[Math.floor(sorted.length * 0.98)] || 1);

  const AO = new Float32Array(n);
  const SPEC = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    AO[i] = Math.min(1, lighting[i] / ref);
    SPEC[i] = Math.max(0, L[i] - lighting[i] * 1.28) * specGain;
  }
  return { w, h, BASE, AO, SPEC };
}

/**
 * The §5 formula: out = tint·base·ao + spec. Keep regions get the ORIGINAL
 * pixels back — a handle, a brass medallion or a logo is hardware, not paint,
 * and must survive every colour unchanged.
 */
function compositeToCanvas(p: Passes, tint: Tint, src: ImageData, keep?: { x: number; y: number; w: number; h: number }[]): HTMLCanvasElement {
  const { w, h } = p;
  const out = new ImageData(w, h);
  const d = out.data;
  for (let i = 0; i < w * h; i++) {
    const bv = p.BASE[i];
    const av = p.AO[i];
    const sv = p.SPEC[i];
    const o = i * 4;
    d[o] = Math.max(0, Math.min(255, (tint[0] * bv * av + sv) * 255));
    d[o + 1] = Math.max(0, Math.min(255, (tint[1] * bv * av + sv) * 255));
    d[o + 2] = Math.max(0, Math.min(255, (tint[2] * bv * av + sv) * 255));
    d[o + 3] = 255;
  }
  if (keep) {
    for (const k of keep) {
      const x0 = Math.max(0, Math.round(k.x * w));
      const y0 = Math.max(0, Math.round(k.y * h));
      const x1 = Math.min(w, Math.round((k.x + k.w) * w));
      const y1 = Math.min(h, Math.round((k.y + k.h) * h));
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const o = (y * w + x) * 4;
          d[o] = src.data[o];
          d[o + 1] = src.data[o + 1];
          d[o + 2] = src.data[o + 2];
        }
      }
    }
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.putImageData(out, 0, 0);
  return c;
}

/** Leaves composite at this width: enough for the stage on a large screen. */
const WORK_W = 1024;
/** The casing crop is small and smooth; half that is plenty. */
const CASING_W = 512;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('image failed: ' + src.slice(0, 80)));
    im.src = src;
  });
}

function drawAt(img: HTMLImageElement, workW: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; w: number; h: number } {
  const scale = Math.min(1, workW / img.naturalWidth);
  const w = Math.max(2, Math.round(img.naturalWidth * scale));
  const h = Math.max(2, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return { canvas, ctx, w, h };
}

/**
 * Results are cached by part + colour + source length (the length catches a
 * bench override republished under the same id). A recolour costs one derive
 * (~100ms) and one composite (~50ms) the first time; every later look is free.
 */
const cache = new Map<string, Promise<string | null>>();
function cached(key: string, make: () => Promise<string | null>): Promise<string | null> {
  let p = cache.get(key);
  if (!p) {
    p = make().catch(() => null);
    cache.set(key, p);
  }
  return p;
}

/** A leaf recoloured to the tint, hardware and ornaments kept original. */
export function recolorLeaf(leaf: Leaf, tint: Tint): Promise<string | null> {
  return cached(`leaf|${leaf.id}|${tint.join(',')}|${leaf.image.length}`, async () => {
    const img = await loadImage(leaf.image);
    const { ctx, w, h } = drawAt(img, WORK_W);
    const src = ctx.getImageData(0, 0, w, h);
    const passes = derivePasses(src.data, w, h);
    return compositeToCanvas(passes, tint, src, leaf.keep).toDataURL('image/jpeg', 0.92);
  });
}

/**
 * The room's nalichnik, recoloured — a transparent PNG at the room's own
 * proportions, laid over the room image. `room.trimBoxes` lists every piece of
 * trim that takes the paint (a shaft ring, a crown, a foot block — however
 * many a real moulded surround needs); this paints them all. Null when the
 * room has no boxes measured.
 *
 * All boxes are cropped and tinted from ONE bounding box spanning every piece
 * together, not one crop per box. derivePasses' blur sigma and AO
 * normalisation are both relative to the crop they run on (see above), so
 * separate crops would each pick their own reference and could disagree right
 * where two pieces meet — a foot against the shaft it sits under, a crown
 * against the shaft below it. One shared derivation keeps the whole surround
 * reading as one continuous piece of trim, exactly as it physically is.
 *
 * Every box's outline (plus its own hand-traced inner hole, if it has one)
 * goes into ONE Path2D with the default nonzero fill rule, so two pieces that
 * legitimately overlap (a foot block commonly overlaps the shaft it sits
 * under) still both paint fully. `open` is then punched out afterward as a
 * SEPARATE erase over the whole union — a floor that keeps the doorway itself
 * from ever taking paint regardless of what any individual piece traced.
 *
 * The crop is read from `room.thumb` — the untouched photo, door and all —
 * NOT `room.image`. Boxes that border the opening (the shaft ring does, on
 * every side) would otherwise have `room.image`'s unlit recess for a STAGE
 * bleed into their own lighting estimate: the blur that derives local
 * lighting has a wide-enough radius to pull that near-black in, which starves
 * BASE·AO right where the ring is thinnest and washes the tint out to a pale
 * version of itself. The thumb has a real, lit photograph in the opening
 * instead of a hole, so the same blur reads a believable neighbour there.
 */
/** Twice the signed area of a closed loop (shoelace formula) — its SIGN is
 *  all that's used here: which rotational direction the points wind in. */
function signedArea(pts: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a;
}

/** `pts`, reversed if needed so its signed area has the same sign as `ref`.
 *  A hole must wind OPPOSITE its outer loop for the nonzero fill rule to
 *  cancel it out — but a hand-traced loop can come in clicked in either
 *  rotational direction, so the winding is corrected here rather than left
 *  to chance (or explained to whoever is dragging points on a photo). */
function windLike(pts: { x: number; y: number }[], ref: number): { x: number; y: number }[] {
  return Math.sign(signedArea(pts)) === Math.sign(ref) ? pts : [...pts].reverse();
}

function addLoop(path: Path2D, pts: { x: number; y: number }[], w: number, h: number) {
  path.moveTo(Math.round(pts[0].x * w), Math.round(pts[0].y * h));
  for (let i = 1; i < pts.length; i++) path.lineTo(Math.round(pts[i].x * w), Math.round(pts[i].y * h));
  path.closePath();
}

export function recolorTrim(room: Room, tint: Tint): Promise<string | null> {
  const boxes = room.trimBoxes;
  if (!boxes || !boxes.length) return Promise.resolve(null);
  // The box list is part of the key, not just the room id: a published room's
  // boxes never change at runtime, but the admin bench's live preview edits
  // them on every drag, and a stale cache hit there would show the wrong shape.
  const boxKey = boxes.map((b) => `${b.x},${b.y},${b.w},${b.h},${b.points?.map((p) => `${p.x},${p.y}`).join(',') ?? ''},${b.holePoints?.map((p) => `${p.x},${p.y}`).join(',') ?? ''}`).join(';');
  return cached(`trim|${room.id}|${tint.join(',')}|${room.image.length}|${boxKey}`, async () => {
    const img = await loadImage(room.thumb ?? room.image);
    const { canvas, w, h } = drawAt(img, CASING_W);

    const ux0 = Math.min(...boxes.map((b) => b.x));
    const uy0 = Math.min(...boxes.map((b) => b.y));
    const ux1 = Math.max(...boxes.map((b) => b.x + b.w));
    const uy1 = Math.max(...boxes.map((b) => b.y + b.h));
    const cx = Math.round(ux0 * w);
    const cy = Math.round(uy0 * h);
    const cw = Math.max(2, Math.round((ux1 - ux0) * w));
    const ch = Math.max(2, Math.round((uy1 - uy0) * h));

    const crop = document.createElement('canvas');
    crop.width = cw;
    crop.height = ch;
    const cctx = crop.getContext('2d', { willReadFrequently: true })!;
    cctx.drawImage(canvas, cx, cy, cw, ch, 0, 0, cw, ch);
    const src = cctx.getImageData(0, 0, cw, ch);
    const tinted = compositeToCanvas(derivePasses(src.data, cw, ch), tint, src);

    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const octx = out.getContext('2d')!;

    // Union the boxes with the default (nonzero) fill rule, not evenodd:
    // a plinth foot commonly overlaps the shaft box it sits under (both cover
    // its top few pixels), and evenodd would read that overlap as crossed
    // twice and leave it unpainted — the opposite of what two boxes covering
    // the same trim should do.
    const path = new Path2D();
    for (const b of boxes) {
      const outer: { x: number; y: number }[] =
        b.points && b.points.length >= 3
          ? b.points
          : [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }];
      addLoop(path, outer, w, h);
      // A hand-traced inner edge, wound opposite the outer loop regardless
      // of which direction it was actually clicked in (see windLike below) —
      // nonzero fill then reads it as a hole rather than doubling the paint.
      if (b.holePoints && b.holePoints.length >= 3) addLoop(path, windLike(b.holePoints, -signedArea(outer)), w, h);
    }
    octx.save();
    octx.clip(path);
    octx.drawImage(tinted, cx, cy);
    octx.restore();

    // Punch the doorway back out. A separate erase, not folded into the union
    // above, so it comes out regardless of which box(es) happen to overlap it.
    octx.save();
    octx.globalCompositeOperation = 'destination-out';
    octx.fillRect(Math.round(room.open.x * w), Math.round(room.open.y * h), Math.round(room.open.w * w), Math.round(room.open.h * h));
    octx.restore();

    return out.toDataURL('image/png');
  });
}

/**
 * Resolve an async render to a URL, with a fallback while it runs — the
 * original image, so a door in mid-recolour simply shows as photographed for
 * a frame rather than flashing blank.
 */
export function useRender(make: () => Promise<string | null>, fallback: string, deps: unknown[]): string {
  const [url, setUrl] = useState<string>(fallback);
  useEffect(() => {
    let live = true;
    setUrl(fallback);
    make().then((u) => {
      if (live && u) setUrl(u);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return url;
}
