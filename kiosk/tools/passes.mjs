/**
 * Deriving the §5 passes from photographs, since we have no CAD.
 *
 *   base = L / blur(L)   — divide the lighting out; what's left is albedo
 *   ao   = blur(L)       — what we divided out IS the lighting
 *   spec = max(0, L - t) — the highlights, clipped off the top
 *
 * and the shader puts them back together as `tint*base * ao + spec`.
 *
 * This is an approximation and SPEC §5 says so: it holds for matte paint and
 * breaks on gloss. Every leaf in our set is matte, which is why the spike read
 * as painted steel rather than as plastic. The day we shoot a gloss door this
 * file is where it will fail, and it should fail loudly rather than ship.
 */
import sharp from 'sharp';

export const LUMA = [0.2126, 0.7152, 0.0722];

/**
 * `base` is L/blur(L) and centres on 1.0, but it runs past it — a highlight on a
 * bevel divides by a dimmer neighbourhood and lands nearer 2.0. An 8-bit channel
 * stops at 1.0, so the pass is stored scaled DOWN by this much and the shader
 * scales it back. 150 leaves headroom to ~1.7 before clipping, which covers
 * every leaf in the set.
 *
 * Anything that reads base_*.png must undo this. The shader does it with
 * BASE_DECODE, which is derived from this constant — keep them together, because
 * a base that is silently 0.59× renders every door as though it were painted
 * grey, and it looks plausible enough to ship.
 */
export const BASE_SCALE = 150;

/** Luminance plane, float 0..1. */
export function luminance(rgb, n) {
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    L[i] =
      (LUMA[0] * rgb[i * 3] + LUMA[1] * rgb[i * 3 + 1] + LUMA[2] * rgb[i * 3 + 2]) / 255;
  }
  return L;
}

/** One separable box pass, with a running sum and clamped edges. */
function boxBlur(src, dst, w, h, r, horizontal) {
  const [n, m, stride, step] = horizontal ? [h, w, w, 1] : [w, h, 1, w];
  const inv = 1 / (2 * r + 1);
  for (let i = 0; i < n; i++) {
    const row = i * stride;
    const at = (j) => src[row + Math.max(0, Math.min(m - 1, j)) * step];
    let sum = 0;
    for (let j = -r; j <= r; j++) sum += at(j);
    for (let j = 0; j < m; j++) {
      dst[row + j * step] = sum * inv;
      sum += at(j + r + 1) - at(j - r);
    }
  }
}

/**
 * Gaussian blur, in float, three box passes deep.
 *
 * This used to hand the plane to sharp, which meant a round trip through 8 bits
 * to blur a float. That is harmless for `base`, which divides by the result, and
 * ruinous for `spec`, which SUBTRACTS it: two nearly equal numbers cancel, and
 * what survives is the 1/255 quantisation the round trip introduced. Clipped at
 * zero it became hard horizontal stripes across every leaf — invisible under
 * white, unmissable under brass.
 *
 * Three boxes approximate a Gaussian to well within what an 8-bit output can
 * show, and the running sum makes the cost independent of radius.
 */
function blurPlane(L, w, h, sigma) {
  // Box width that makes three passes match the target sigma.
  const r = Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1) / 2));
  let a = Float32Array.from(L);
  let b = new Float32Array(L.length);
  for (let pass = 0; pass < 3; pass++) {
    boxBlur(a, b, w, h, r, true);
    boxBlur(b, a, w, h, r, false);
  }
  return a;
}

/**
 * @param rgb  raw RGB bytes of the part, already cut out
 * @param sigma blur radius for the lighting field. Big enough that the carving
 *   (high frequency) stays out of it, small enough to follow the falloff. Scaled
 *   off the part width so a leaf and a handle get comparable treatment.
 */
export function derivePasses(rgb, w, h, { sigma = null, specGain = 1.4, alpha = null } = {}) {
  const n = w * h;
  const L = luminance(rgb, n);
  const s = sigma ?? Math.max(6, Math.round(w * 0.055));
  const lighting = blurPlane(L, w, h, s);

  const BASE = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    BASE[i] = Math.min(2, L[i] / Math.max(0.02, lighting[i]));
  }

  /**
   * blur(L) is the lighting AND the paint the door happened to be wearing when
   * we shot it. Shipping it as `ao` makes the photograph's own colour a floor
   * the tint can never rise above: the white leaf measured 0.75 and the
   * grey-blue one 0.55, so the same white finish came out as two different
   * whites, and neither reached white.
   *
   * Normalising the top of the distribution to 1.0 takes the albedo out and
   * leaves occlusion — which is what SPEC §5 asks `ao` to be. The tint then
   * fully owns the colour, every model agrees on what white means, and the
   * carving is unaffected because its shadows are high-frequency and already
   * live in `base`.
   *
   * p98 rather than max: one blown pixel should not set the scale for the leaf.
   */
  let ref = 1;
  {
    const lit = [];
    for (let i = 0; i < n; i++) if (!alpha || alpha[i] > 250) lit.push(lighting[i]);
    if (lit.length) {
      lit.sort((a, b) => a - b);
      ref = Math.max(0.02, lit[Math.floor(lit.length * 0.98)]);
    }
  }

  const AO = new Float32Array(n);
  const SPEC = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    AO[i] = Math.min(1, lighting[i] / ref);
    SPEC[i] = Math.max(0, L[i] - lighting[i] * 1.06) * specGain;
  }
  return { L, BASE, AO, SPEC };
}

/** Pack a float plane into an 8-bit grayscale PNG buffer, with alpha. */
export function planeToPng(plane, alpha, w, h, scale) {
  const buf = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = Math.max(0, Math.min(255, plane[i] * scale));
    buf[i * 4] = buf[i * 4 + 1] = buf[i * 4 + 2] = v;
    buf[i * 4 + 3] = alpha[i];
  }
  return sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png();
}

/**
 * How much smaller `ao` is stored than the part it belongs to.
 *
 * Normalised ao spans roughly 0.85–1.0, which is 38 of the 256 values an 8-bit
 * channel can hold — across a 2400px door. Stored at full size that quantises a
 * smooth falloff into contour bands every ~60px. They are invisible under white
 * and impossible to miss under a saturated tint like brass, because the tint
 * multiplies the step.
 *
 * But ao is a 55px-sigma blur: it carries nothing above ~1/27 of the width, so
 * full resolution was never buying detail. Stored small and read back through
 * the GPU's bilinear filter, the texels interpolate and the contouring is gone —
 * the same fix that costs a fifth of the asset budget rather than adding to it.
 * 8× leaves about 4× margin over what the blur can actually represent.
 */
export const AO_DOWNSCALE = 8;

/** `ao` only: no alpha (the mask owns that), and deliberately low-resolution. */
export function aoToPng(plane, w, h) {
  const buf = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) buf[i] = Math.max(0, Math.min(255, plane[i] * 255));
  return sharp(buf, { raw: { width: w, height: h, channels: 1 } })
    .resize(Math.max(2, Math.round(w / AO_DOWNSCALE)), Math.max(2, Math.round(h / AO_DOWNSCALE)))
    .png();
}
