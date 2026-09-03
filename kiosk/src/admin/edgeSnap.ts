/**
 * "Magnetic" point placement — a lightweight stand-in for Photoshop's
 * Magnetic Lasso, built for this bench's actual need: a hand keeps clicking
 * NEAR a real moulding edge, not exactly on it, and a fluted corona has too
 * many such edges close together to place by eye alone. Rather than a full
 * segmentation model (a multi-megabyte download, unpredictable on an
 * unfamiliar wood grain or gilt finish), this computes a plain Sobel edge
 * map of the photo once and snaps a clicked/dragged point to the strongest
 * nearby edge — the same physics a magnetic lasso leans on, without the
 * weight of a model.
 */

export interface EdgeMap {
  w: number;
  h: number;
  /** Gradient magnitude per pixel, row-major. */
  g: Float32Array;
  mean: number;
  std: number;
}

/** Downscaled long side a map is built at — plenty for snapping (a search
 *  radius of a few percent of this is still several pixels wide), and keeps
 *  the one-time Sobel pass well under the length of a render frame even on
 *  a large source photo. */
const MAP_MAX_DIM = 900;

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

  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    gray[i] = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
  }

  const g = new Float32Array(w * h);
  const at = (x: number, y: number) => gray[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  let sum = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx =
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const gy =
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) -
        (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      const v = Math.hypot(gx, gy);
      g[y * w + x] = v;
      sum += v;
    }
  }
  const mean = sum / (w * h);
  let variance = 0;
  for (let i = 0; i < w * h; i++) variance += (g[i] - mean) * (g[i] - mean);
  const std = Math.sqrt(variance / (w * h));

  return { w, h, g, mean, std };
}

/**
 * Snap a point (image fractions, 0..1) to the strongest edge within a small
 * radius. A distance penalty prefers a weaker edge right under the cursor
 * over a stronger one further away — snapping should feel like "settling
 * onto the line I was already aiming at", not "jumping to whatever the
 * strongest edge in the neighbourhood happens to be". Returns the point
 * unchanged when nothing nearby is meaningfully more of an edge than the
 * surrounding texture — a click in a flat area should land exactly where
 * clicked, not drift onto noise.
 */
export function snapToEdge(map: EdgeMap, p: { x: number; y: number }, searchFrac = 0.02): { x: number; y: number } {
  const cx = p.x * map.w;
  const cy = p.y * map.h;
  const cxi = Math.round(cx);
  const cyi = Math.round(cy);
  const r = Math.max(3, Math.round(searchFrac * map.w));

  let bestX = cxi;
  let bestY = cyi;
  let bestG = map.g[Math.min(map.h - 1, Math.max(0, cyi)) * map.w + Math.min(map.w - 1, Math.max(0, cxi))];
  let bestScore = bestG;

  for (let dy = -r; dy <= r; dy++) {
    const yy = cyi + dy;
    if (yy < 0 || yy >= map.h) continue;
    for (let dx = -r; dx <= r; dx++) {
      const xx = cxi + dx;
      if (xx < 0 || xx >= map.w) continue;
      const v = map.g[yy * map.w + xx];
      const dist = Math.hypot(dx, dy);
      const score = v - dist * map.mean * 0.2;
      if (score > bestScore) {
        bestScore = score;
        bestG = v;
        bestX = xx;
        bestY = yy;
      }
    }
  }

  // Only snap onto a genuine edge — a real moulding line stands out well
  // above the photo's average gradient; texture and JPEG noise don't.
  if (bestG < map.mean + map.std * 0.5) return p;
  return { x: bestX / map.w, y: bestY / map.h };
}
