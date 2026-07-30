/**
 * Turn showroom photographs into configurator-ready door leaves.
 *
 *   node tools/leaves.mjs [--only <id>]
 *
 * Four stages, all measured, none eyeballed:
 *
 *   1. FIND    the leaf by its reveal — the shadow gap between leaf and jamb.
 *              Traced at many heights and fitted as lines, so the leaf's four
 *              real edges are known rather than boxed by hand.
 *   2. SQUARE  those four edges give four corners, and a homography maps them
 *              onto a true rectangle. These photographs are not dead-on: the
 *              first one measured 6.4% wider at the top than the bottom, a
 *              keystone the eye reads as "crooked in its frame" without being
 *              able to name it.
 *   3. STRIP   the handle, so any handle can be fitted later. No generative
 *              inpainting is needed or wanted: the hardware sits on a plain
 *              vertical stile and every feature running through it is vertical,
 *              so interpolating each column from clean paint above and below
 *              restores exactly what was behind it and invents nothing.
 *   4. NEUTRAL these were shot in different rooms and the walls bounce their
 *              colour onto the paint — one leaf came out visibly blue. A leaf
 *              DECLARED white is pinned to one white point shared by the whole
 *              catalogue, which is the only way they agree; a leaf that is
 *              genuinely coloured gets only the cast its white casing reveals,
 *              because pinning it would bleach the product. Which it is, is
 *              declared in SOURCES rather than guessed — see `white`.
 *
 * Nothing here is generative. Every output pixel comes from the photograph.
 * Where a photograph cannot support a stage, the pipeline says so and moves on
 * rather than inventing: see `skip`, `trim` and `handle: false`.
 */
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs';

const RAW = 'd:/laragon/www/door configurator/raw-photos';
const OUT = 'd:/laragon/www/door configurator/kiosk/public/assets/leaves';
const SHEET = 'd:/laragon/www/door configurator/kiosk/tools/_leaves-contact.jpg';

/**
 * The doors, and anything a photograph needs said about it.
 *
 * `white: true` declares the leaf is painted white. It is stated, not guessed:
 * measuring the leaf's own saturation cannot tell a white door under a strong
 * blue cast (the rosette reads 0.31) from a door that is genuinely painted a
 * pale colour, and getting it wrong either bleaches a real finish or leaves a
 * white door looking blue in a warm room. Whoever adds the door knows which it
 * is; the pipeline should not have to guess.
 *
 * `skip` documents a rejection so the cull is not re-argued later.
 */
const SOURCES = [
  // Handle logic is off for now (a demo decision): every door keeps the handle
  // it was photographed with — `handle: false` — rather than having it stripped
  // and a shared one fitted back. `handleSource` still captures the lever asset
  // so switching the feature back on later needs no re-shoot.
  { id: 'lattice', file: 'GD8A6670.JPG', white: true, handle: false, handleSource: true, name: { uz: 'Romb naqsh', kk: 'Romb naqıs', ru: 'Ромб' } },
  { id: 'classic', file: 'GD8A6656.JPG', white: true, handle: false, name: { uz: 'Klassik panel', kk: 'Klassik panel', ru: 'Классическая' } },
  { id: 'twopanel', file: 'GD8A6687.JPG', white: true, handle: false, name: { uz: 'Ikki panel', kk: 'Eki panel', ru: 'Две филёнки' } },
  // The trace overshoots this one's hinge edge and takes a strip of casing with
  // it: the hallway shot has no strong wall colour, so the fallback separation
  // by contrast cannot tell casing from leaf. The true edge was measured off
  // the rectified leaf's own luminance profile — a clear reveal dip at x=1247
  // of 1400 — and is corrected here rather than guessed at by the detector.
  /**
   * `handle: false` — this leaf keeps the handle it was photographed with.
   *
   * Its bronze medallion sits at handle height and is dark enough to read as
   * hardware, so the stripper takes the ornament with the lever and wipes half
   * the design away. Stripping is a convenience — it lets a handle be swapped —
   * and it is not worth destroying a door's face for. This one is offered with
   * its own handle, and it is honest either way: that IS how it is made.
   */
  { id: 'rosette', file: 'GD8A8888.JPG', white: true, handle: false, handleSide: 'right', trim: { right: 0.109 }, name: { uz: 'Rozetka', kk: 'Rozetka', ru: 'Розетка' } },

  // Rejected, with the reason, so the cull is not re-argued later. All three
  // are real products — they simply were not photographed in a way a flat
  // composite can use, and a reshoot fixes every one of them.
  /**
   * Rejected, with the reason, so the cull is not re-argued. Every one of these
   * is a real product; the photograph is what fails, and a reshoot fixes it —
   * see SHOOTING-BRIEF.md. Robust line fitting was added to rescue them and did
   * straighten the trace, which only proved the point: the problem is not the
   * detector, it is that a leaf seen at three-quarters has no flat rectangle to
   * recover. Its own thickness is in the frame.
   */
  { file: 'GD8A6762.JPG', skip: 'photographed open; a configurator needs it closed' },
  { file: 'GD8A6642.JPG', skip: 'hinge side reads 88px of scatter even after outlier rejection — the leaf edge is not straight in this frame' },
  { file: 'GD8A6731.JPG', skip: 'three-quarter view: the leaf edge and a strip of the side wall are both in shot' },
  { file: 'GD8A8890.JPG', skip: 'three-quarter view; the trace lands on the casing and the recovered aspect (0.52) is impossible for a door' },
];

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;

// ---------------------------------------------------------------- helpers

function reader(data, W, H, C) {
  return {
    lum: (x, y) => {
      const i = (y * W + x) * C;
      return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    },
    sat: (x, y) => {
      const i = (y * W + x) * C;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      return mx < 8 ? 0 : (mx - mn) / mx;
    },
  };
}

const argmin = (p, a, b) => {
  let best = a, bv = Infinity;
  for (let i = a; i <= b; i++) if (p[i] < bv) { bv = p[i]; best = i; }
  return best;
};

/** Least squares through (t, v) pairs, returning v = m*t + c. */
function lsq(pts) {
  const n = pts.length;
  let st = 0, sv = 0, stt = 0, stv = 0;
  for (const [t, v] of pts) { st += t; sv += v; stt += t * t; stv += v * t; }
  const m = (n * stv - st * sv) / (n * stt - st * st);
  return { m, c: (sv - m * st) / n };
}

/**
 * A line fitted so that a few bad samples cannot drag it.
 *
 * The reveal is traced by looking for the darkest pixel across the jamb, and on
 * the hinge side the HINGES are darker still — so at the three or four heights
 * where a hinge sits, the trace jumps to it. Least squares treats those jumps as
 * evidence and tilts the whole edge; one door scattered 120px and was thrown out
 * for it. Fitting, discarding whatever lies far off that fit, and refitting
 * keeps the hinges from voting.
 */
function fitLine(pts) {
  let line = lsq(pts);
  let kept = pts;
  for (let pass = 0; pass < 2; pass++) {
    const res = kept.map(([t, v]) => Math.abs(v - (line.m * t + line.c)));
    const sorted = res.slice().sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1];
    const cut = Math.max(2, med * 3);
    const next = kept.filter((_, i) => res[i] <= cut);
    if (next.length < Math.max(6, kept.length * 0.5)) break;
    kept = next;
    line = lsq(kept);
  }
  return { ...line, kept: kept.length, of: pts.length };
}

/**
 * How straight the trace was, judged only on the samples the fit kept.
 *
 * Including the rejected ones would defeat the robust fit: the whole point is
 * that a hinge is not evidence about where the edge runs.
 */
function residual(pts, line) {
  const r = pts
    .map(([t, v]) => Math.abs(v - (line.m * t + line.c)))
    .sort((a, b) => a - b)
    .slice(0, Math.max(6, Math.round(pts.length * 0.7)));
  return r[r.length >> 1];
}

// ---------------------------------------------------------------- stages

/** Locate the leaf's four corners, or explain why it could not be done. */
function findLeaf(data, W, H, C) {
  const { lum, sat } = reader(data, W, H, C);

  const bandX = (yc, half) => {
    const p = new Float64Array(W);
    let n = 0;
    for (let y = Math.max(0, yc - half); y < Math.min(H, yc + half); y += 2) {
      for (let x = 0; x < W; x++) p[x] += lum(x, y);
      n++;
    }
    for (let x = 0; x < W; x++) p[x] /= n;
    return p;
  };
  const bandY = (xc, half) => {
    const p = new Float64Array(H);
    let n = 0;
    for (let x = Math.max(0, xc - half); x < Math.min(W, xc + half); x += 2) {
      for (let y = 0; y < H; y++) p[y] += lum(x, y);
      n++;
    }
    for (let y = 0; y < H; y++) p[y] /= n;
    return p;
  };

  /**
   * The door assembly (leaf + casing) against the wall.
   *
   * Saturation separates them when the wall is the showroom's strong teal. When
   * it is not — the hallway shots — the wall is a neutral grey and saturation
   * says nothing, so the fallback is contrast: the casing is markedly brighter
   * than the wall beside it.
   */
  const midY = Math.round(H * 0.5);
  let x0 = -1, x1 = -1;
  for (let x = 0; x < W; x++) if (sat(x, midY) < 0.18) { x0 = x; break; }
  for (let x = W - 1; x >= 0; x--) if (sat(x, midY) < 0.18) { x1 = x; break; }
  const bySat = x0 >= 0 && x1 > x0 && (x1 - x0) > W * 0.25;
  if (!bySat) {
    const p = bandX(midY, Math.round(H * 0.02));
    let peak = 0;
    for (let x = 0; x < W; x++) if (p[x] > peak) peak = p[x];
    const cut = peak * 0.78;
    for (let x = 0; x < W; x++) if (p[x] > cut) { x0 = x; break; }
    for (let x = W - 1; x >= 0; x--) if (p[x] > cut) { x1 = x; break; }
  }
  if (x0 < 0 || x1 <= x0) return { error: 'could not separate the door from the wall' };

  const span = x1 - x0;
  const inset = Math.round(span * 0.20);

  const leftPts = [], rightPts = [];
  for (let f = 0.16; f <= 0.86; f += 0.02) {
    const y = Math.round(H * f);
    const p = bandX(y, Math.round(H * 0.008));
    leftPts.push([y, argmin(p, x0 + Math.round(span * 0.02), x0 + inset)]);
    rightPts.push([y, argmin(p, x1 - inset, x1 - Math.round(span * 0.02))]);
  }
  const L = fitLine(leftPts), R = fitLine(rightPts);
  const resL = residual(leftPts, L), resR = residual(rightPts, R);
  // A reveal is a straight line. A trace that wanders was following something
  // else — a moulding, a reflection — and must not be trusted.
  if (resL > span * 0.02 || resR > span * 0.02) {
    return { error: `reveal trace not straight (${resL.toFixed(0)}/${resR.toFixed(0)}px scatter)` };
  }

  const xa = Math.round(L.c + L.m * H * 0.5) + Math.round(span * 0.10);
  const xb = Math.round(R.c + R.m * H * 0.5) - Math.round(span * 0.10);
  if (xb <= xa) return { error: 'leaf too narrow to trace' };
  const topPts = [], botPts = [];
  const step = Math.max(1, Math.round((xb - xa) / 24));
  for (let x = xa; x <= xb; x += step) {
    const p = bandY(x, Math.round(span * 0.01));
    topPts.push([x, argmin(p, Math.round(H * 0.05), Math.round(H * 0.20))]);
    botPts.push([x, argmin(p, Math.round(H * 0.88), Math.round(H * 0.995))]);
  }
  const T = fitLine(topPts), B = fitLine(botPts);

  const cross = (v, h) => {
    const x = (v.m * h.c + v.c) / (1 - v.m * h.m);
    return [x, h.m * x + h.c];
  };
  const TL = cross(L, T), TR = cross(R, T), BR = cross(R, B), BL = cross(L, B);
  const topW = TR[0] - TL[0], botW = BR[0] - BL[0];
  const hgt = (BL[1] - TL[1] + BR[1] - TR[1]) / 2;
  if (!(topW > 0 && botW > 0 && hgt > 0)) return { error: 'degenerate corners' };
  const aspect = ((topW + botW) / 2) / hgt;
  // A real interior leaf is roughly 0.35–0.55 wide for its height. Anything
  // outside that means the trace latched onto the wrong pair of lines.
  if (aspect < 0.30 || aspect > 0.60) return { error: `implausible leaf aspect ${aspect.toFixed(3)}` };

  return { TL, TR, BR, BL, topW, botW, hgt, aspect, keystone: (topW - botW) / botW };
}

/** Map the leaf quad onto a true rectangle. */
function rectify(data, W, H, C, quad, OW, OH) {
  const dst = [[0, 0], [OW, 0], [OW, OH], [0, OH]];
  const src = [quad.TL, quad.TR, quad.BR, quad.BL];
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [X, Y] = dst[i], [x, y] = src[i];
    A.push([X, Y, 1, 0, 0, 0, -X * x, -Y * x]); b.push(x);
    A.push([0, 0, 0, X, Y, 1, -X * y, -Y * y]); b.push(y);
  }
  for (let i = 0; i < 8; i++) {
    let piv = i;
    for (let r = i + 1; r < 8; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
    [A[i], A[piv]] = [A[piv], A[i]];
    [b[i], b[piv]] = [b[piv], b[i]];
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
  const out = Buffer.alloc(OW * OH * 3);
  for (let Y = 0; Y < OH; Y++) {
    for (let X = 0; X < OW; X++) {
      const d = h[6] * X + h[7] * Y + 1;
      const sx = (h[0] * X + h[1] * Y + h[2]) / d;
      const sy = (h[3] * X + h[4] * Y + h[5]) / d;
      const xi = Math.floor(sx), yi = Math.floor(sy);
      const fx = sx - xi, fy = sy - yi;
      const o = (Y * OW + X) * 3;
      for (let c = 0; c < 3; c++) {
        const s = (xx, yy) => {
          const cx = Math.max(0, Math.min(W - 1, xx));
          const cy = Math.max(0, Math.min(H - 1, yy));
          return data[(cy * W + cx) * C + c];
        };
        out[o + c] =
          s(xi, yi) * (1 - fx) * (1 - fy) + s(xi + 1, yi) * fx * (1 - fy) +
          s(xi, yi + 1) * (1 - fx) * fy + s(xi + 1, yi + 1) * fx * fy;
      }
    }
  }
  return out;
}

/**
 * Cut the handle out of a leaf as a reusable, recolourable asset.
 *
 * The lever and its rose are matte black on white paint, so an alpha built
 * straight from darkness isolates them cleanly. The key and any lock cylinder
 * are deliberately excluded — the key is a photographer's prop, and a lock is
 * per-door hardware — by keeping only the compact blob at lever height and
 * dropping anything hanging below it.
 *
 * Saved oversized around the blob with a soft-edged alpha, so the drop shadow
 * comes too and the handle sits on a new door without a hard cut line.
 */
function captureHandle(buf, W, H, s) {
  const lum = (x, y) => {
    const i = (y * W + x) * 3;
    return 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
  };
  const wx0 = 0, wx1 = Math.round(W * 0.44);
  const wy0 = Math.round(H * 0.44), wy1 = Math.round(H * 0.66); // lever band only
  const DARK = 120;
  // largest dark blob = lever + rose
  const seen = new Uint8Array(W * H);
  let best = null;
  for (let y = wy0; y < wy1; y++) {
    for (let x = wx0; x < wx1; x++) {
      if (seen[y * W + x] || lum(x, y) >= DARK) continue;
      let a = x, b = x, c = y, d = y, count = 0;
      const st = [[x, y]];
      seen[y * W + x] = 1;
      while (st.length) {
        const [cx, cy] = st.pop();
        count++;
        if (cx < a) a = cx; if (cx > b) b = cx; if (cy < c) c = cy; if (cy > d) d = cy;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < wx0 || nx >= wx1 || ny < wy0 || ny >= wy1) continue;
          if (seen[ny * W + nx] || lum(nx, ny) >= DARK) continue;
          seen[ny * W + nx] = 1;
          st.push([nx, ny]);
        }
      }
      if (!best || count > best.count) best = { count, a, b, c, d };
    }
  }
  if (!best) return;
  // Crop tight to the lever blob, and only a little below it — the lock cylinder
  // and the dangling key sit just under the lever, and a generous bottom pad
  // swept them into the cutout. A small margin keeps the rose's own soft shadow
  // without reaching the lock.
  const padX = Math.round(W * 0.04);
  const padTop = Math.round(W * 0.035);
  const padBot = Math.round(W * 0.015);
  const x0 = Math.max(0, best.a - padX), x1 = Math.min(W - 1, best.b + padX);
  const y0 = Math.max(0, best.c - padTop), y1 = Math.min(H - 1, best.d + padBot);
  const hw = x1 - x0, hh = y1 - y0;
  const out = Buffer.alloc(hw * hh * 4);
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < hw; x++) {
      const sx = x0 + x, sy = y0 + y;
      const i = (sy * W + sx) * 3;
      const l = lum(sx, sy);
      // Opaque only on the actual metal (dark), a short ramp for its shadow, and
      // fully clear on the paint. A wide ramp made the whole crop faintly
      // visible as a rectangle; a tight one leaves just the handle and its cast
      // shadow.
      const alpha = l < 100 ? 255 : l > 165 ? 0 : Math.round((165 - l) / 65 * 255);
      const o = (y * hw + x) * 4;
      out[o] = buf[i]; out[o + 1] = buf[i + 1]; out[o + 2] = buf[i + 2];
      out[o + 3] = alpha;
    }
  }
  const P = 'd:/laragon/www/door configurator/kiosk/public/assets/handles';
  fs.mkdirSync(P, { recursive: true });
  // Everything the app needs to put this back at true scale and position:
  //  - the cutout's size as a fraction of the leaf (so it scales with the leaf)
  //  - where the lever's optical centre sits INSIDE the cutout (so an asymmetric
  //    crop still lands its centre on the leaf's handle point).
  const cxBlob = (best.a + best.b) / 2, cyBlob = (best.c + best.d) / 2;
  s._handle = {
    buf: out,
    w: hw,
    h: hh,
    wFrac: hw / W,
    hFrac: hh / H,
    cx: (cxBlob - x0) / hw,
    cy: (cyBlob - y0) / hh,
  };
  console.log(`  ↳ handle captured from ${s.id}: ${hw}x${hh}`);
}

/** Take the hardware off, filling each column from clean paint above and below. */
function stripHandle(buf, W, H) {
  const lum = (x, y) => {
    const i = (y * W + x) * 3;
    return 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
  };
  /**
   * Which stile carries the handle.
   *
   * A door is hung left or right and the hardware follows; assuming the left
   * stile silently left the right-hung leaves with their handles still on. So
   * both stiles are weighed at handle height and the darker one wins — hardware
   * is matte black on white paint, so the vote is not close.
   */
  const wy0 = Math.round(H * 0.42), wy1 = Math.round(H * 0.72);
  const stile = (a, b) => {
    let s = 0, n2 = 0, dark = 0;
    for (let y = wy0; y < wy1; y += 3) {
      for (let x = a; x < b; x += 3) { const v = lum(x, y); s += v; n2++; if (v < 110) dark++; }
    }
    return { mean: s / n2, dark: dark / n2 };
  };
  // The window reaches to the very edge of the leaf. A handle sits close to the
  // lock stile's edge, and stopping short of it — as an inset window did —
  // simply misses the hardware on a leaf that was cropped tight.
  const left = stile(0, Math.round(W * 0.44));
  const right = stile(Math.round(W * 0.56), W);
  const onLeft = left.dark >= right.dark;
  const wx0 = onLeft ? 0 : Math.round(W * 0.56);
  const wx1 = onLeft ? Math.round(W * 0.44) : W;

  // Hardware is far darker than white paint, but a coloured leaf is darker
  // too — so the threshold is set relative to this leaf's own brightness.
  let sum = 0, n = 0;
  for (let y = wy0; y < wy1; y += 4) for (let x = wx0; x < wx1; x += 4) { sum += lum(x, y); n++; }
  const DARK = Math.min(120, (sum / n) * 0.55);

  const seen = new Uint8Array(W * H);
  let best = null;
  for (let y = wy0; y < wy1; y++) {
    for (let x = wx0; x < wx1; x++) {
      if (seen[y * W + x] || lum(x, y) >= DARK) continue;
      let a = x, b2 = x, c2 = y, d2 = y, count = 0;
      const stack = [[x, y]];
      seen[y * W + x] = 1;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        count++;
        if (cx < a) a = cx; if (cx > b2) b2 = cx;
        if (cy < c2) c2 = cy; if (cy > d2) d2 = cy;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < wx0 || nx >= wx1 || ny < wy0 || ny >= wy1) continue;
          if (seen[ny * W + nx] || lum(nx, ny) >= DARK) continue;
          seen[ny * W + nx] = 1;
          stack.push([nx, ny]);
        }
      }
      if (!best || count > best.count) best = { count, a, b2, c2, d2 };
    }
  }
  if (!best || best.count < W * H * 0.0004) return { ok: false, why: 'no hardware found' };

  /**
   * The lever, the escutcheon and the key are separate dark blobs and all three
   * must go, so the winner's box is grown to take in its neighbours.
   *
   * Only its NEIGHBOURS. An earlier version swept in every dark pixel at the
   * handle's height, which on the rosette door reached across the leaf and
   * swallowed the bronze medallion — the patch then wiped half the ornament
   * away. Hardware belongs to one cluster; anything further off than about a
   * handle's width is part of the door's design and must be left alone.
   */
  const reach = Math.max(best.b2 - best.a, best.d2 - best.c2) * 1.2;
  let minX = best.a, maxX = best.b2, minY = best.c2, maxY = best.d2;
  for (let y = Math.max(wy0, best.c2 - Math.round(reach)); y < Math.min(wy1, best.d2 + Math.round(reach)); y++) {
    for (let x = Math.max(wx0, best.a - Math.round(reach)); x < Math.min(wx1, best.b2 + Math.round(reach)); x++) {
      if (lum(x, y) >= DARK) continue;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }

  // Vertical padding can be generous — the stile is uniform. Horizontal must
  // not be: the naqsh begins a little to the right and its pattern runs
  // DIAGONALLY, which column interpolation would wipe into a smooth stripe.
  const padY = Math.round(W * 0.045);
  const padX = Math.round(W * 0.02);
  const pY0 = Math.max(0, minY - Math.round(H * 0.10));
  const pY1 = Math.max(1, minY - Math.round(H * 0.03));
  const colVar = (x) => {
    let s = 0, s2 = 0, k = 0;
    for (let y = pY0; y < pY1; y++) { const v = lum(x, y); s += v; s2 += v * v; k++; }
    return s2 / k - (s / k) ** 2;
  };
  // Scan from the hardware toward the middle of the leaf — that is the way the
  // naqsh lies, whichever stile the handle is on — and stop where the surface
  // stops being smooth. Column interpolation must never reach the pattern.
  const outward = onLeft ? 1 : -1;
  const from = onLeft ? maxX + 4 : minX - 4;
  const baseline = colVar(onLeft ? Math.max(0, minX - 5) : Math.min(W - 1, maxX + 5));
  let stop = null;
  for (let x = from; x > 2 && x < W - 2; x += outward) {
    if (colVar(x) > baseline + 12) { stop = x - 3 * outward; break; }
  }
  let bx0 = Math.max(0, minX - padX);
  let bx1 = Math.min(W - 1, maxX + padX);
  if (stop !== null) {
    if (onLeft) bx1 = Math.max(minX + 1, Math.min(bx1, stop));
    else bx0 = Math.min(maxX - 1, Math.max(bx0, stop));
  }
  const by0 = Math.max(0, minY - padY);
  const by1 = Math.min(H - 1, maxY + padY);

  // Reference bands stand clear of the drop shadow, which reaches well past
  // anything the darkness threshold catches; sampling flush left a ghost.
  const GAP = Math.round(W * 0.03), REF = 24;
  const med = (a) => { const s = a.slice().sort((p, q) => p - q); return s[s.length >> 1]; };
  const above = [], below = [];
  for (let x = bx0; x <= bx1; x++) {
    const A2 = [[], [], []], B2 = [[], [], []];
    for (let k = 0; k < REF; k++) {
      for (let c = 0; c < 3; c++) {
        A2[c].push(buf[(Math.max(0, by0 - GAP - k) * W + x) * 3 + c]);
        B2[c].push(buf[(Math.min(H - 1, by1 + GAP + k) * W + x) * 3 + c]);
      }
    }
    above.push(A2.map(med));
    below.push(B2.map(med));
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
    const t = u * u * u * (u * (u * 6 - 15) + 10); // smootherstep: no seam
    for (let x = bx0; x <= bx1; x++) {
      const i = x - bx0, nz = rnd() * grain * 0.8;
      for (let c = 0; c < 3; c++) {
        buf[(y * W + x) * 3 + c] = Math.max(0, Math.min(255, above[i][c] * (1 - t) + below[i][c] * t + nz));
      }
    }
  }
  // The side is worth reporting: a handle fitted later must go back on the
  // stile the door is actually hung to open from.
  return { ok: true, box: [bx0, by0, bx1, by1], side: onLeft ? 'left' : 'right' };
}

/**
 * Remove the wall's colour cast, measured off the white casing.
 *
 * The casing is the one surface in the frame we know is neutral, and it sits in
 * the same light as the leaf. Reading the cast off the leaf instead would turn
 * every door white — including the ones that are not.
 */
function neutralise(leaf, LW, LH, data, W, H, C, quad, isWhite) {
  const { sat, lum } = reader(data, W, H, C);

  /**
   * Is this a white door?
   *
   * If it is, its own paint is the best neutral reference there is, and pinning
   * it to a common target makes every white leaf agree — which matters, because
   * these were shot in different rooms and one came out visibly bluer than the
   * rest. Reading the cast off the surrounding casing cannot fix that: when the
   * whole frame is cool, the casing is cool too and the correction sees nothing
   * to correct.
   *
   * If the leaf is genuinely coloured, this must not run — it would bleach the
   * product. Then the casing is the only reference available and we settle for
   * removing what cast it can see.
   */
  let satSum = 0, satN = 0;
  for (let i = 0; i < LW * LH * 3; i += 3 * 37) {
    const r = leaf[i], g = leaf[i + 1], b = leaf[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx > 40) { satSum += (mx - mn) / mx; satN++; }
  }
  const leafSat = satSum / Math.max(1, satN);

  if (isWhite) {
    // White paint: take the brightest tenth of the leaf as its white point.
    const px = [];
    for (let i = 0; i < LW * LH * 3; i += 3 * 11) {
      px.push([0.2126 * leaf[i] + 0.7152 * leaf[i + 1] + 0.0722 * leaf[i + 2], leaf[i], leaf[i + 1], leaf[i + 2]]);
    }
    px.sort((a, b) => b[0] - a[0]);
    const take = px.slice(0, Math.max(20, Math.round(px.length * 0.10)));
    const white = [1, 2, 3].map((c) => take.reduce((s, p) => s + p[c], 0) / take.length);
    const TARGET = 244; // a common white for the whole catalogue
    const gain = white.map((v) => TARGET / v);
    const shoulder = (v) => (v <= 219 ? v : 255 - 36 * Math.exp(-(v - 219) / 36));
    for (let i = 0; i < LW * LH * 3; i += 3) {
      for (let c = 0; c < 3; c++) leaf[i + c] = Math.max(0, Math.min(255, shoulder(leaf[i + c] * gain[c])));
    }
    return { applied: true, mode: 'white', gain, sat: leafSat };
  }

  // Sample just outside the leaf's edges: that is the casing.
  const samples = [];
  for (let f = 0.25; f <= 0.75; f += 0.05) {
    const y = Math.round(quad.TL[1] + (quad.BL[1] - quad.TL[1]) * f);
    const lx = Math.round(quad.TL[0] + (quad.BL[0] - quad.TL[0]) * f);
    const rx = Math.round(quad.TR[0] + (quad.BR[0] - quad.TR[0]) * f);
    for (const [dir, edge] of [[-1, lx], [1, rx]]) {
      for (let d = Math.round(LW * 0.01); d < Math.round(LW * 0.06); d += 2) {
        const x = edge + dir * d;
        if (x < 0 || x >= W || y < 0 || y >= H) continue;
        if (sat(x, y) > 0.12) continue; // coloured: not the white casing
        if (lum(x, y) < 90) continue; // shadowed
        const i = (y * W + x) * C;
        samples.push([data[i], data[i + 1], data[i + 2], lum(x, y)]);
      }
    }
  }
  if (samples.length < 40) return { applied: false, why: 'no neutral casing found' };
  samples.sort((a, b) => b[3] - a[3]);
  const take = samples.slice(0, Math.max(20, Math.round(samples.length * 0.3)));
  const white = [0, 1, 2].map((c) => take.reduce((s, p) => s + p[c], 0) / take.length);
  const mean = (white[0] + white[1] + white[2]) / 3;
  const gain = white.map((v) => mean / v);

  // Gentle lift with a soft shoulder: brighten the paint without driving its
  // own highlights past white, which flattens the moulding into paper.
  const lift = Math.min(1.35, 232 / mean);
  const shoulder = (v) => (v <= 219 ? v : 255 - 36 * Math.exp(-(v - 219) / 36));
  for (let i = 0; i < LW * LH * 3; i += 3) {
    for (let c = 0; c < 3; c++) {
      leaf[i + c] = Math.max(0, Math.min(255, shoulder(leaf[i + c] * gain[c] * lift)));
    }
  }
  return { applied: true, mode: 'casing', gain, sat: leafSat };
}

// ---------------------------------------------------------------- run

fs.mkdirSync(OUT, { recursive: true });
const done = [];
for (const s of SOURCES) {
  if (s.skip) { console.log(`— ${s.file}: skipped (${s.skip})`); continue; }
  if (only && s.id !== only) continue;

  const { data, info } = await sharp(path.join(RAW, s.file)).rotate().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;

  const quad = findLeaf(data, W, H, C);
  if (quad.error) { console.log(`✗ ${s.id.padEnd(9)} ${s.file}  — ${quad.error}`); continue; }

  /**
   * A measured correction to the detected quad.
   *
   * The detector is right on a clean showroom frame and can overshoot on a shot
   * it was not designed for. Rather than loosen it — which would risk every
   * door to rescue one — the edge is pulled in by a fraction that was measured
   * off the rectified leaf. Applied to the QUAD, before rectifying, so nothing
   * is resampled twice.
   */
  if (s.trim) {
    const lerp = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    const t = s.trim;
    if (t.right) { quad.TR = lerp(quad.TR, quad.TL, t.right); quad.BR = lerp(quad.BR, quad.BL, t.right); }
    if (t.left) { quad.TL = lerp(quad.TL, quad.TR, t.left); quad.BL = lerp(quad.BL, quad.BR, t.left); }
    if (t.top) { quad.TL = lerp(quad.TL, quad.BL, t.top); quad.TR = lerp(quad.TR, quad.BR, t.top); }
    if (t.bottom) { quad.BL = lerp(quad.BL, quad.TL, t.bottom); quad.BR = lerp(quad.BR, quad.TR, t.bottom); }
    const tw = quad.TR[0] - quad.TL[0], bw = quad.BR[0] - quad.BL[0];
    quad.aspect = ((tw + bw) / 2) / ((quad.BL[1] - quad.TL[1] + quad.BR[1] - quad.TR[1]) / 2);
  }

  const OW = 1400;
  const OH = Math.round(OW / quad.aspect);
  const leaf = rectify(data, W, H, C, quad, OW, OH);

  // Cut the leaf's own handle out BEFORE it is stripped away, from the one door
  // chosen as the handle source. It was shot dead-on in the same light as every
  // other leaf, so it drops back onto any of them with the perspective and the
  // lighting already matching — which a separate close-up, shot at an angle,
  // never could. One handle, reused, beats four mismatched ones.
  if (s.handleSource) captureHandle(leaf, OW, OH, s);

  const strip = s.handle === false ? { ok: false, why: 'kept by request' } : stripHandle(leaf, OW, OH);
  const norm = neutralise(leaf, OW, OH, data, W, H, C, quad, s.white === true);

  const file = path.join(OUT, `${s.id}.png`);
  await sharp(leaf, { raw: { width: OW, height: OH, channels: 3 } }).png({ compressionLevel: 9 }).toFile(file);

  /**
   * A compact source, so the bench can reopen a built-in door and re-cut it just
   * like a door added by hand. The rotated original at ~1300px is a few hundred
   * kilobytes — loaded only when a door is edited, never on the showroom's first
   * paint — and it carries the corners this run measured, as fractions, so the
   * marks come back exactly where the pipeline put them.
   */
  const srcMaxW = 1300;
  const srcScale = Math.min(1, srcMaxW / W);
  await sharp(data, { raw: { width: W, height: H, channels: C } })
    .resize(Math.round(W * srcScale), Math.round(H * srcScale))
    .jpeg({ quality: 82 })
    .toFile(path.join(OUT, `${s.id}-src.jpg`));
  const cornersFrac = [quad.TL, quad.TR, quad.BR, quad.BL].map(([x, y]) => ({
    x: +(x / W).toFixed(4),
    y: +(y / H).toFixed(4),
  }));

  console.log(
    `✓ ${s.id.padEnd(9)} ${OW}x${OH}  aspect ${quad.aspect.toFixed(3)}  ` +
    `keystone ${(quad.keystone * 100).toFixed(1)}%  ` +
    `handle ${strip.ok ? `stripped (${strip.side})` : '— ' + strip.why}  ` +
    `white ${norm.applied ? `${norm.mode}(sat ${norm.sat.toFixed(2)}) ${norm.gain.map((g) => g.toFixed(2)).join('/')}` : '— ' + norm.why}`
  );
  // Where the handle goes back, as fractions of the leaf: the centre of the box
  // that was stripped. A leaf whose handle was kept keeps its own and needs no
  // placement.
  const place = strip.ok
    ? {
        x: ((strip.box[0] + strip.box[2]) / 2 / OW).toFixed(4),
        y: ((strip.box[1] + strip.box[3]) / 2 / OH).toFixed(4),
      }
    : null;
  done.push({
    ...s,
    file,
    aspect: quad.aspect,
    handleSide: strip.ok ? strip.side : s.handleSide ?? 'left',
    handleSwappable: strip.ok,
    place,
    cornersFrac,
    white: s.white === true,
    handleChoice: s.handle === false ? 'none' : strip.ok ? strip.side : s.handleSide ?? 'left',
  });
}

/**
 * Emit the catalogue the app reads.
 *
 * Generated, not hand-kept: the aspect below is the leaf's MEASURED proportion,
 * and a hand-maintained copy of it would drift the moment a photograph was
 * re-cut — which is exactly the class of silent error this project has paid for
 * before.
 */
if (!only && done.length) {
  const ts = `// GENERATED by tools/leaves.mjs — do not edit by hand.
// Re-run: node tools/leaves.mjs
import type { Leaf } from './types';

export const LEAVES: Leaf[] = [
${done
  .map(
    (d) => `  {
    id: '${d.id}',
    name: { uz: '${d.name.uz}', kk: '${d.name.kk}', ru: '${d.name.ru}' },
    image: '/assets/leaves/${d.id}.png',
    /** measured, not assumed — see tools/leaves.mjs */
    aspect: ${d.aspect.toFixed(4)},
    handleSide: '${d.handleSide}',
    /** false when the leaf still wears the handle it was photographed with */
    handleSwappable: ${d.handleSwappable},${d.place ? `\n    handleAt: { x: ${d.place.x}, y: ${d.place.y} },` : ''}
    /** so the bench can reopen and re-cut this door — loaded only when editing */
    source: '/assets/leaves/${d.id}-src.jpg',
    corners: [${d.cornersFrac.map((c) => `{ x: ${c.x}, y: ${c.y} }`).join(', ')}],
    white: ${d.white},
    handleChoice: '${d.handleChoice}',
  },`
  )
  .join('\n')}
];
`;
  fs.writeFileSync('d:/laragon/www/door configurator/kiosk/src/catalog/leaves.generated.ts', ts);
  console.log('catalogue → src/catalog/leaves.generated.ts');

  await writeHandles(done);
}

/**
 * The handle, in the finishes the workshop sells.
 *
 * One dead-on cutout, recoloured — not four separate photographs. The lever is
 * a near-neutral dark object, so its own light and shade carry across a tint
 * unchanged, which is what makes a recolour read as brushed metal rather than as
 * flat paint. A tint is applied in gamma-aware linear light and multiplied over
 * the metal's own luminance, and the width is stored so the app can place it at
 * the leaf's true scale.
 */
async function writeHandles(list) {
  const source = list.find((d) => d._handle)?._handle;
  if (!source) { console.log('no handle captured'); return; }
  const P = 'd:/laragon/www/door configurator/kiosk/public/assets/handles';
  const { buf, w, h } = source;

  /**
   * Each finish is a floor colour, a range, and a highlight colour.
   *
   * The source lever is near-black, so a plain multiply leaves every finish dark
   * and muddy — the first attempt made chrome look like slate and brass like
   * olive. Instead its luminance is expanded across the finish's own tonal range
   * (shadow → floor, highlight → the metal's bright reflection) with a gamma
   * that keeps the specular streaks reading as metal. Black barely moves; chrome
   * opens right up to a near-white sheen; brass warms as it brightens.
   */
  const FINISHES = [
    { id: 'black', name: { uz: 'Qora', kk: 'Qara', ru: 'Чёрный' }, floor: [18, 18, 20], hi: [120, 122, 128], gamma: 0.9 },
    { id: 'chrome', name: { uz: 'Xrom', kk: 'Xrom', ru: 'Хром' }, floor: [96, 100, 110], hi: [246, 248, 252], gamma: 0.62 },
    { id: 'brass', name: { uz: 'Guruch', kk: 'Guruch', ru: 'Латунь' }, floor: [96, 74, 38], hi: [232, 198, 128], gamma: 0.72 },
  ];
  const srgbToLin = (v) => Math.pow(v / 255, 2.2);

  // The lever's own luminance range, so it can be stretched edge to edge rather
  // than guessing where black and highlight sit.
  let lo = 1, hi = 0;
  for (let i = 0; i < w * h; i++) {
    if (buf[i * 4 + 3] < 128) continue;
    const L = 0.2126 * srgbToLin(buf[i * 4]) + 0.7152 * srgbToLin(buf[i * 4 + 1]) + 0.0722 * srgbToLin(buf[i * 4 + 2]);
    if (L < lo) lo = L;
    if (L > hi) hi = L;
  }
  const span = Math.max(0.02, hi - lo);

  const meta = [];
  for (const f of FINISHES) {
    const out = Buffer.from(buf);
    for (let i = 0; i < w * h; i++) {
      if (buf[i * 4 + 3] === 0) continue;
      const L = 0.2126 * srgbToLin(buf[i * 4]) + 0.7152 * srgbToLin(buf[i * 4 + 1]) + 0.0722 * srgbToLin(buf[i * 4 + 2]);
      const t = Math.pow(Math.max(0, Math.min(1, (L - lo) / span)), f.gamma);
      for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(f.floor[c] + (f.hi[c] - f.floor[c]) * t);
    }
    await sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toFile(path.join(P, `${f.id}.png`));
    meta.push(f);
    console.log(`  ↳ handle ${f.id} ${w}x${h}`);
  }

  const src = list.find((d) => d._handle)._handle;
  const ts = `// GENERATED by tools/leaves.mjs — do not edit by hand.
import type { Handle } from './types';

/**
 * How the handle cutout maps onto a leaf.
 *  wFrac/hFrac — the cutout's size as a fraction of the leaf, so it scales with
 *  it; cx/cy — the lever's optical centre inside the cutout, so an asymmetric
 *  crop still lands on the leaf's handle point.
 */
export const HANDLE_PLACE = { wFrac: ${src.wFrac.toFixed(4)}, hFrac: ${src.hFrac.toFixed(4)}, cx: ${src.cx.toFixed(3)}, cy: ${src.cy.toFixed(3)} };

export const HANDLES: Handle[] = [
${meta.map((f) => `  { id: '${f.id}', name: { uz: '${f.name.uz}', kk: '${f.name.kk}', ru: '${f.name.ru}' }, image: '/assets/handles/${f.id}.png' },`).join('\n')}
];
`;
  fs.writeFileSync('d:/laragon/www/door configurator/kiosk/src/catalog/handles.generated.ts', ts);
  console.log('handles → src/catalog/handles.generated.ts');
}

// A contact sheet, so the whole set can be judged at once rather than one by one.
if (done.length) {
  const TW = 300, TH = 760;
  const tiles = [];
  for (let i = 0; i < done.length; i++) {
    const b = await sharp(done[i].file).resize({ width: TW, height: TH - 30, fit: 'contain', background: '#1b1a18' }).toBuffer();
    tiles.push({ input: b, left: (i % 5) * (TW + 12), top: Math.floor(i / 5) * TH });
  }
  await sharp({
    create: { width: 5 * (TW + 12), height: Math.ceil(done.length / 5) * TH, channels: 3, background: '#1b1a18' },
  }).composite(tiles).jpeg({ quality: 88 }).toFile(SHEET);
  console.log(`\ncontact sheet → ${SHEET}`);
}
console.log(`\n${done.length} of ${SOURCES.filter((s) => !s.skip).length} leaves prepared`);
