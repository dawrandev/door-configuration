/**
 * "Magnetic" point placement — a lightweight stand-in for Photoshop's
 * Magnetic Lasso, built for this bench's actual need: a hand keeps clicking
 * NEAR a real moulding edge, not exactly on it, and a fluted corona has too
 * many such edges close together to place by eye alone. Rather than a full
 * segmentation model (a multi-megabyte download, unpredictable on an
 * unfamiliar wood grain or gilt finish), this computes a Canny-style edge
 * map of the photo once — denoise, Sobel, thin the ridges to the true edge
 * line rather than a blurry band — and snaps a clicked/dragged point onto
 * the nearest surviving ridge.
 */

export interface EdgeMap {
  w: number;
  h: number;
  /** Gradient magnitude per pixel, row-major, thinned to ~1px ridges by
   *  non-maximum suppression — 0 everywhere else. */
  g: Float32Array;
}

/** Downscaled long side a map is built at. High enough that a moulding's
 *  individual profile lines (a few pixels apart in a close-up photo) don't
 *  blur into one ridge, while staying comfortably within a single render
 *  frame's budget for the one-time pass. */
const MAP_MAX_DIM = 1300;

function toGray(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    gray[i] = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
  }
  return gray;
}

/** A single 3x3 box blur — enough to settle sensor grain and JPEG blocking
 *  before differentiating, without smearing a real moulding edge into a
 *  wider band than it already is. */
function boxBlur3(src: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  const at = (x: number, y: number) => src[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum += at(x + dx, y + dy);
      out[y * w + x] = sum / 9;
    }
  }
  return out;
}

/**
 * Thin a raw gradient magnitude field down to its ridge lines — the same
 * step Canny edge detection uses. A raw Sobel response is a BAND several
 * pixels wide around a real edge, not a line; searching that band directly
 * biases a snap toward wherever inside the band the search happened to
 * start, which is exactly the imprecision magnetic snapping is meant to
 * remove. Non-maximum suppression keeps a pixel only if it is a local
 * maximum along its OWN gradient direction (the direction perpendicular to
 * the edge it sits on), collapsing the band to the true centre line.
 */
function nonMaxSuppress(mag: Float32Array, gx: Float32Array, gy: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const m = mag[idx];
      if (m <= 0) continue;
      // Round the gradient direction to the nearest of the 4 principal
      // compass directions, and compare against the two neighbours that
      // direction points at — the standard Canny 4-bin approximation.
      let angle = Math.atan2(gy[idx], gx[idx]);
      if (angle < 0) angle += Math.PI;
      const deg = (angle * 180) / Math.PI;
      let nx1: number, ny1: number, nx2: number, ny2: number;
      if (deg < 22.5 || deg >= 157.5) { nx1 = 1; ny1 = 0; nx2 = -1; ny2 = 0; }
      else if (deg < 67.5) { nx1 = 1; ny1 = 1; nx2 = -1; ny2 = -1; }
      else if (deg < 112.5) { nx1 = 0; ny1 = 1; nx2 = 0; ny2 = -1; }
      else { nx1 = -1; ny1 = 1; nx2 = 1; ny2 = -1; }
      const m1 = mag[(y + ny1) * w + (x + nx1)];
      const m2 = mag[(y + ny2) * w + (x + nx2)];
      if (m >= m1 && m >= m2) out[idx] = m;
    }
  }
  return out;
}

/** Build an edge map from an already-loaded image. Safe to call once per
 *  photo (or per padded preview refresh) and cache the result — it does not
 *  depend on zoom or on-screen scale, only on the image's own pixels. */
export function buildEdgeMap(img: HTMLImageElement | HTMLCanvasElement): EdgeMap {
  const iw = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
  const ih = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
  const scale = Math.min(1, MAP_MAX_DIM / Math.max(iw, ih));
  const w = Math.max(2, Math.round(iw * scale));
  const h = Math.max(2, Math.round(ih * scale));

  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const smoothed = boxBlur3(toGray(data, w, h), w, h);

  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  const mag = new Float32Array(w * h);
  const at = (x: number, y: number) => smoothed[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ix =
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const iy =
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      const idx = y * w + x;
      gx[idx] = ix;
      gy[idx] = iy;
      mag[idx] = Math.hypot(ix, iy);
    }
  }

  return { w, h, g: nonMaxSuppress(mag, gx, gy, w, h) };
}

/** A ridge weaker than this is sensor/JPEG noise surviving thinning by
 *  chance, not a real edge — calibrated against a 0..255 luma Sobel
 *  response (a clean, strong step tops out in the hundreds). */
const MIN_RIDGE = 30;

/**
 * Snap a point (image fractions, 0..1) to the nearest surviving ridge
 * within a small radius. A distance penalty prefers a weaker ridge right
 * under the cursor over a stronger one further away — snapping should feel
 * like "settling onto the line I was already aiming at", not "jumping to
 * whichever edge in the neighbourhood is strongest". The bar to snap at all
 * is set from the window's OWN statistics (most of it is 0 after thinning,
 * so a handful of genuine ridge pixels stand out clearly) rather than a
 * single global number, so it adapts to a photo with both bright,
 * high-contrast wood and dim, low-contrast shadow. Returns the point
 * unchanged when nothing nearby clears both bars — a click in a flat area
 * lands exactly where clicked, not drifting onto noise.
 */
export function snapToEdge(map: EdgeMap, p: { x: number; y: number }, searchFrac = 0.02): { x: number; y: number } {
  const cxi = Math.round(p.x * map.w);
  const cyi = Math.round(p.y * map.h);
  const r = Math.max(4, Math.round(searchFrac * map.w));

  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let dy = -r; dy <= r; dy++) {
    const yy = cyi + dy;
    if (yy < 0 || yy >= map.h) continue;
    for (let dx = -r; dx <= r; dx++) {
      const xx = cxi + dx;
      if (xx < 0 || xx >= map.w) continue;
      const v = map.g[yy * map.w + xx];
      sum += v;
      sumSq += v * v;
      count++;
    }
  }
  if (count === 0) return p;
  const mean = sum / count;
  const variance = Math.max(0, sumSq / count - mean * mean);
  const threshold = Math.max(MIN_RIDGE, mean + Math.sqrt(variance));

  let bestX = cxi;
  let bestY = cyi;
  let bestScore = -Infinity;
  let found = false;
  for (let dy = -r; dy <= r; dy++) {
    const yy = cyi + dy;
    if (yy < 0 || yy >= map.h) continue;
    for (let dx = -r; dx <= r; dx++) {
      const xx = cxi + dx;
      if (xx < 0 || xx >= map.w) continue;
      const v = map.g[yy * map.w + xx];
      if (v < threshold) continue;
      const dist = Math.hypot(dx, dy);
      const score = v - dist * 6;
      if (score > bestScore) {
        bestScore = score;
        bestX = xx;
        bestY = yy;
        found = true;
      }
    }
  }

  if (!found) return p;
  return { x: bestX / map.w, y: bestY / map.h };
}
