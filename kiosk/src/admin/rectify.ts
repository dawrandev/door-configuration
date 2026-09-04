/**
 * The leaf pipeline, in the browser.
 *
 * This is the same maths as tools/leaves.mjs, moved client-side so a
 * salesperson can upload a photograph, mark the door's four corners, and get a
 * professional dead-on leaf back with no server round-trip. It is the answer to
 * the real workflow: sellers will photograph doors at whatever angle they can,
 * and those photographs must still come out looking as if a designer prepared
 * them — without a designer.
 *
 * Nothing here is generative. Every output pixel comes from the photograph;
 * perspective is corrected, not imagined, so the door on the client site is the
 * exact door the workshop sells.
 */

export interface Pt {
  x: number;
  y: number;
}

/** Solve the 8-DoF homography mapping the unit output rect to the source quad. */
function homography(src: [Pt, Pt, Pt, Pt], OW: number, OH: number): number[] {
  const dst: Pt[] = [
    { x: 0, y: 0 },
    { x: OW, y: 0 },
    { x: OW, y: OH },
    { x: 0, y: OH },
  ];
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: X, y: Y } = dst[i];
    const { x, y } = src[i];
    A.push([X, Y, 1, 0, 0, 0, -X * x, -Y * x]);
    b.push(x);
    A.push([0, 0, 0, X, Y, 1, -X * y, -Y * y]);
    b.push(y);
  }
  for (let i = 0; i < 8; i++) {
    let p = i;
    for (let r = i + 1; r < 8; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]];
    [b[i], b[p]] = [b[p], b[i]];
    for (let r = i + 1; r < 8; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c < 8; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  const h = new Array(8).fill(0);
  for (let i = 7; i >= 0; i--) {
    let s = b[i];
    for (let c = i + 1; c < 8; c++) s -= A[i][c] * h[c];
    h[i] = s / A[i][i];
  }
  return h;
}

/** Fractions of the leaf's own computed width/height to extend the rectify
 *  canvas by on each side — see `rectify`'s `margin` parameter. */
export interface Margin { left: number; right: number; top: number; bottom: number }
const NO_MARGIN: Margin = { left: 0, right: 0, top: 0, bottom: 0 };

/**
 * Warp the quad the corners describe onto a true rectangle.
 *
 * The output proportion is the quad's own average width over its height, so a
 * door keeps the shape it really is; only the perspective is removed. Bilinear
 * sampling keeps the far side, which the camera saw at lower resolution, from
 * going blocky.
 *
 * `margin`, when given, extends the output canvas past the leaf's own four
 * corners — the same homography that places the leaf flat is defined over the
 * whole plane, not just inside the quad, so evaluating it a bit further out
 * pulls in whatever the photo actually shows just past the door: the casing,
 * if the door was shot standing in its frame. No new maths, only a bigger
 * canvas and a sample loop that starts before 0 and ends past OW/OH. Zero
 * margin (the default) is pixel-identical to the un-padded call — every
 * existing caller is unaffected.
 */
export function rectify(img: HTMLImageElement | HTMLCanvasElement, corners: [Pt, Pt, Pt, Pt], targetW = 1200, margin: Margin = NO_MARGIN): HTMLCanvasElement {
  const [TL, TR, BR, BL] = corners;
  const topW = Math.hypot(TR.x - TL.x, TR.y - TL.y);
  const botW = Math.hypot(BR.x - BL.x, BR.y - BL.y);
  const leftH = Math.hypot(BL.x - TL.x, BL.y - TL.y);
  const rightH = Math.hypot(BR.x - TR.x, BR.y - TR.y);
  const aspect = ((topW + botW) / 2) / ((leftH + rightH) / 2);

  const OW = targetW;
  const OH = Math.round(OW / aspect);
  const h = homography(corners, OW, OH);

  // read the source
  const sc = document.createElement('canvas');
  sc.width = img.width;
  sc.height = img.height;
  sc.getContext('2d')!.drawImage(img, 0, 0);
  const sd = sc.getContext('2d')!.getImageData(0, 0, img.width, img.height).data;
  const SW = img.width, SH = img.height;
  const sample = (xx: number, yy: number, c: number) => {
    const cx = Math.max(0, Math.min(SW - 1, xx));
    const cy = Math.max(0, Math.min(SH - 1, yy));
    return sd[(cy * SW + cx) * 4 + c];
  };

  // The leaf's own [0,OW]x[0,OH] now sits inset by the margin inside a
  // larger canvas — X0/Y0 is where output-space 0,0 (the leaf's own top
  // left) lands within it.
  const X0 = Math.round(margin.left * OW), Y0 = Math.round(margin.top * OH);
  const PW = X0 + OW + Math.round(margin.right * OW);
  const PH = Y0 + OH + Math.round(margin.bottom * OH);

  // The homography is only well-behaved near the quad it was solved from —
  // `d` (its projective denominator) can shrink toward zero, or even flip
  // sign, once X/Y are extrapolated far enough past it, sending sx/sy to
  // wild or flipped-side values. `d` at the leaf's own 4 corners sets the
  // scale of what "well-behaved" looks like for THIS particular photo angle;
  // once a margin pixel's own d drops well below that, the maths has left
  // solid ground. Never checked inside the leaf's own [0,OW]x[0,OH] — the
  // margin=0 call stays pixel-identical to before this existed.
  const cornerDs = [[0, 0], [OW, 0], [OW, OH], [0, OH]].map(([X, Y]) => h[6] * X + h[7] * Y + 1);
  const dFloor = Math.max(0.05, Math.min(...cornerDs) * 0.25);

  const out = new ImageData(PW, PH);
  for (let PY = 0; PY < PH; PY++) {
    const Y = PY - Y0;
    const inLeafY = PY >= Y0 && PY < Y0 + OH;
    for (let PX = 0; PX < PW; PX++) {
      const X = PX - X0;
      const o = (PY * PW + PX) * 4;
      const inLeaf = inLeafY && PX >= X0 && PX < X0 + OW;
      const d = h[6] * X + h[7] * Y + 1;
      if (!inLeaf && d < dFloor) continue; // stays transparent — the maths broke down out here, not real casing
      const sx = (h[0] * X + h[1] * Y + h[2]) / d;
      const sy = (h[3] * X + h[4] * Y + h[5]) / d;
      // Past the edge of what the camera actually captured, clamping would
      // silently repeat the boundary pixel — reading as real casing that
      // was never photographed. Left transparent instead, so a margin
      // wider than the photo shows honestly ends, rather than lying.
      if (!inLeaf && (sx < 0 || sx > SW - 1 || sy < 0 || sy > SH - 1)) continue;
      const xi = Math.floor(sx), yi = Math.floor(sy);
      const fx = sx - xi, fy = sy - yi;
      for (let c = 0; c < 3; c++) {
        out.data[o + c] =
          sample(xi, yi, c) * (1 - fx) * (1 - fy) +
          sample(xi + 1, yi, c) * fx * (1 - fy) +
          sample(xi, yi + 1, c) * (1 - fx) * fy +
          sample(xi + 1, yi + 1, c) * fx * fy;
      }
      out.data[o + 3] = 255;
    }
  }
  const dc = document.createElement('canvas');
  dc.width = PW;
  dc.height = PH;
  dc.getContext('2d')!.putImageData(out, 0, 0);
  return dc;
}

/**
 * Encode a canvas that may carry transparency.
 *
 * `rectify` leaves margin pixels transparent wherever the photograph simply
 * doesn't reach (see the two `continue`s above) — that is the honest answer,
 * but it only survives a format with an alpha channel. A canvas exported to
 * JPEG is composited onto solid BLACK first, which turned every
 * un-photographed margin pixel into an opaque black bar once the trim was
 * masked and recoloured on the client. WebP keeps alpha at JPEG-like size;
 * PNG is the fallback for a browser that cannot encode it.
 */
export function encodeAlpha(canvas: HTMLCanvasElement, quality = 0.85): string {
  const webp = canvas.toDataURL('image/webp', quality);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
}

/**
 * Take the handle off a rectified leaf, in place.
 *
 * Same idea as the offline tool: the hardware sits on a plain vertical stile, so
 * each column is refilled from clean paint above and below and nothing is
 * invented. `side` says which stile to look on; a leaf whose handle should stay
 * (a carved medallion at handle height) passes `side: 'none'`.
 */
export function stripHandle(canvas: HTMLCanvasElement, side: 'left' | 'right' | 'none'): void {
  if (side === 'none') return;
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  const im = ctx.getImageData(0, 0, W, H);
  const d = im.data;
  const lum = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  };

  const wx0 = side === 'left' ? 0 : Math.round(W * 0.56);
  const wx1 = side === 'left' ? Math.round(W * 0.44) : W;
  const wy0 = Math.round(H * 0.42), wy1 = Math.round(H * 0.72);
  let sum = 0, n = 0;
  for (let y = wy0; y < wy1; y += 4) for (let x = wx0; x < wx1; x += 4) { sum += lum(x, y); n++; }
  const DARK = Math.min(120, (sum / n) * 0.55);

  // largest dark blob = lever + rose
  const seen = new Uint8Array(W * H);
  let best: { count: number; a: number; b: number; c: number; d: number } | null = null;
  for (let y = wy0; y < wy1; y++) {
    for (let x = wx0; x < wx1; x++) {
      if (seen[y * W + x] || lum(x, y) >= DARK) continue;
      let a = x, b = x, c = y, e = y, count = 0;
      const st: [number, number][] = [[x, y]];
      seen[y * W + x] = 1;
      while (st.length) {
        const [cx, cy] = st.pop()!;
        count++;
        if (cx < a) a = cx; if (cx > b) b = cx; if (cy < c) c = cy; if (cy > e) e = cy;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < wx0 || nx >= wx1 || ny < wy0 || ny >= wy1) continue;
          if (seen[ny * W + nx] || lum(nx, ny) >= DARK) continue;
          seen[ny * W + nx] = 1;
          st.push([nx, ny]);
        }
      }
      if (!best || count > best.count) best = { count, a, b, c, d: e };
    }
  }
  if (!best || best.count < W * H * 0.0004) return;

  const reach = Math.max(best.b - best.a, best.d - best.c) * 1.2;
  let minX = best.a, maxX = best.b, minY = best.c, maxY = best.d;
  for (let y = Math.max(wy0, best.c - reach); y < Math.min(wy1, best.d + reach); y++) {
    for (let x = Math.max(wx0, best.a - reach); x < Math.min(wx1, best.b + reach); x++) {
      if (lum(x, y) >= DARK) continue;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }

  const padY = Math.round(W * 0.045);
  const padX = Math.round(W * 0.02);
  const pY0 = Math.max(0, minY - Math.round(H * 0.1));
  const pY1 = Math.max(1, minY - Math.round(H * 0.03));
  const colVar = (x: number) => {
    let s = 0, s2 = 0, k = 0;
    for (let y = pY0; y < pY1; y++) { const v = lum(x, y); s += v; s2 += v * v; k++; }
    return s2 / k - (s / k) ** 2;
  };
  const outward = side === 'left' ? 1 : -1;
  const from = side === 'left' ? maxX + 4 : minX - 4;
  const baseline = colVar(side === 'left' ? Math.max(0, minX - 5) : Math.min(W - 1, maxX + 5));
  let stop: number | null = null;
  for (let x = from; x > 2 && x < W - 2; x += outward) {
    if (colVar(x) > baseline + 12) { stop = x - 3 * outward; break; }
  }
  let bx0 = Math.max(0, minX - padX);
  let bx1 = Math.min(W - 1, maxX + padX);
  if (stop !== null) {
    if (side === 'left') bx1 = Math.max(minX + 1, Math.min(bx1, stop));
    else bx0 = Math.min(maxX - 1, Math.max(bx0, stop));
  }
  const by0 = Math.max(0, minY - padY);
  const by1 = Math.min(H - 1, maxY + padY);

  const GAP = Math.round(W * 0.03), REF = 24;
  const median = (arr: number[]) => { arr.sort((p, q) => p - q); return arr[arr.length >> 1]; };
  const above: number[][] = [], below: number[][] = [];
  for (let x = bx0; x <= bx1; x++) {
    const A2: number[][] = [[], [], []], B2: number[][] = [[], [], []];
    for (let k = 0; k < REF; k++) {
      for (let c = 0; c < 3; c++) {
        A2[c].push(d[(Math.max(0, by0 - GAP - k) * W + x) * 4 + c]);
        B2[c].push(d[(Math.min(H - 1, by1 + GAP + k) * W + x) * 4 + c]);
      }
    }
    above.push(A2.map(median));
    below.push(B2.map(median));
  }

  let grain = 0, gn = 0;
  for (let y = Math.max(0, by0 - 60); y < Math.max(1, by0 - 10); y++) {
    for (let x = bx0; x <= bx1; x++) { grain += Math.abs(lum(x, y) - lum(x, y + 1)); gn++; }
  }
  grain = gn ? grain / gn : 1;
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;

  for (let y = by0; y <= by1; y++) {
    const u = (y - by0) / Math.max(1, by1 - by0);
    const t = u * u * u * (u * (u * 6 - 15) + 10);
    for (let x = bx0; x <= bx1; x++) {
      const i = x - bx0, nz = rnd() * grain * 0.8;
      for (let c = 0; c < 3; c++) {
        d[(y * W + x) * 4 + c] = Math.max(0, Math.min(255, above[i][c] * (1 - t) + below[i][c] * t + nz));
      }
    }
  }
  ctx.putImageData(im, 0, 0);
}

/**
 * Even a white leaf's colour to one shared white point, in place.
 *
 * Runs only when the door is declared white — a coloured door is left alone, or
 * its finish would be bleached out. The leaf's brightest tenth is its white, and
 * it is scaled to a common target so every white door in the catalogue agrees.
 */
export function neutraliseWhite(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  const im = ctx.getImageData(0, 0, W, H);
  const d = im.data;
  const px: [number, number, number, number][] = [];
  for (let i = 0; i < W * H; i += 11) {
    px.push([0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2], d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]);
  }
  px.sort((a, b) => b[0] - a[0]);
  const take = px.slice(0, Math.max(20, Math.round(px.length * 0.1)));
  const white = [1, 2, 3].map((c) => take.reduce((s, p) => s + (p[c] as number), 0) / take.length);
  const TARGET = 244;
  const gain = white.map((v) => TARGET / v);
  const shoulder = (v: number) => (v <= 219 ? v : 255 - 36 * Math.exp(-(v - 219) / 36));
  for (let i = 0; i < W * H; i++) {
    for (let c = 0; c < 3; c++) d[i * 4 + c] = Math.max(0, Math.min(255, shoulder(d[i * 4 + c] * gain[c])));
  }
  ctx.putImageData(im, 0, 0);
}
