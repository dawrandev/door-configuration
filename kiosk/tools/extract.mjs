/**
 * Turns the raw photographs into the §5 layer stack.
 *
 *   node tools/extract.mjs [--preview <dir>]
 *
 * Per model it writes, all at CANON size and pixel-aligned by construction:
 *   leaf_base.png  leaf_ao.png  leaf_spec.png  leaf_mask.png
 *   frame_base.png frame_ao.png frame_spec.png frame_mask.png
 *   hardware.png   (the black lock/handle, cut out and left untinted)
 *
 * The teal showroom wall is keyed out by chroma distance rather than by a
 * rectangle, because the frame's outer edge is moulded and a rectangle would
 * either clip the moulding or keep a rind of wall around it. The key runs on
 * the frame ring only — the leaf is a plain rectangle well inside the wall and
 * needs no keying.
 */
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs';
import { RAW_DIR, OUT_DIR, CANON, SOURCES } from './sources.mjs';
import { derivePasses, planeToPng, aoToPng, LUMA, BASE_SCALE } from './passes.mjs';

const previewDir = process.argv.includes('--preview')
  ? process.argv[process.argv.indexOf('--preview') + 1]
  : null;

function toHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const c = mx - mn;
  let h = 0;
  if (c > 0.001) {
    if (mx === r) h = (((g - b) / c) % 6) * 60;
    else if (mx === g) h = ((b - r) / c + 2) * 60;
    else h = ((r - g) / c + 4) * 60;
    if (h < 0) h += 360;
  }
  return [h, mx > 0.01 ? c / mx : 0, mx];
}

/**
 * Sample the backing the way a chroma key is supposed to: off the plate.
 *
 * The showroom wall is far and away the most saturated thing in every frame, so
 * the top decile of saturation IS the wall. Reading its hue per photograph beats
 * hard-coding one, because "teal" drifted between 190° and 193° across the set
 * and the shoots were months apart.
 */
function sampleBacking(rgb, n) {
  const sats = [];
  for (let i = 0; i < n; i++) sats.push(toHsv(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2])[1]);
  const sorted = Float64Array.from(sats).sort();
  const cut = sorted[Math.floor(n * 0.9)];

  let sx = 0, sy = 0, ss = 0, count = 0;
  for (let i = 0; i < n; i++) {
    if (sats[i] < cut) continue;
    const [h, s] = toHsv(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
    // circular mean — hue wraps, and a naive average of 359 and 1 gives 180
    sx += Math.cos((h * Math.PI) / 180);
    sy += Math.sin((h * Math.PI) / 180);
    ss += s;
    count++;
  }
  let hue = (Math.atan2(sy / count, sx / count) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  return { hue, sat: ss / count };
}

/**
 * Alpha for the door assembly: opaque on the door, transparent on the wall.
 *
 * The discriminator is SATURATION, not hue. That is the whole lesson of this
 * function: the wall measured hue 190 / sat 0.99 and the hexagon architrave hue
 * 204 / sat 0.34 — only 14° apart in hue, which is nothing, so an earlier
 * hue-weighted key ate half the frame and left a translucent rind down the edge
 * of every door. In saturation they are 0.34 against 0.99, and no part of any
 * door in the set goes past 0.35. That is a margin worth keying on.
 *
 * Hue still gets a vote, but only to reject something saturated that is not the
 * backing — a brass handle, say.
 */
function wallAlpha(rgb, n, backing) {
  const a = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const [hue, sat] = toHsv(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);

    let dHue = Math.abs(hue - backing.hue);
    if (dHue > 180) dHue = 360 - dHue;
    const onHue = dHue < 25 ? 1 : Math.max(0, 1 - (dHue - 25) / 20);

    // Ramp across the empty middle: everything door-side sits under 0.35 and the
    // backing sits near 1.0, so the transition can be placed where no real pixel
    // lives and the edge still comes out soft rather than stepped.
    const ratio = sat / Math.max(0.05, backing.sat);
    const isWall = onHue * smoothstep(0.45, 0.7, ratio);
    a[i] = Math.round(Math.max(0, Math.min(1, 1 - isWall)) * 255);
  }
  return a;
}

function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * Pull the alpha edge in by a pixel or two.
 *
 * Even a good key leaves a rind: at the boundary the sensor mixed wall and frame
 * into one pixel, so it is genuinely part teal and no threshold recovers it.
 * Eroding costs a pixel of moulding nobody can see and removes a coloured
 * outline everybody can.
 */
function erodeAlpha(a, w, h, r) {
  const out = Uint8Array.from(a);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let min = 255;
      for (let dy = -r; dy <= r && min > 0; dy++) {
        const yy = Math.max(0, Math.min(h - 1, y + dy));
        for (let dx = -r; dx <= r; dx++) {
          const xx = Math.max(0, Math.min(w - 1, x + dx));
          const v = a[yy * w + xx];
          if (v < min) min = v;
          if (!min) break;
        }
      }
      out[y * w + x] = min;
    }
  }
  return out;
}

/**
 * Alpha for the black hardware inside its box: opaque where dark, transparent
 * where light, soft across the edge. Every leaf in the set is light and every
 * handle is black anodised, so luminance alone separates them.
 *
 * The threshold deliberately keeps ONLY the metal. The handle's cast shadow is
 * mid-luminance and stays behind with the leaf, which is where it belongs — a
 * shadow on a walnut door is dark walnut, not grey, so it has to tint with the
 * leaf rather than ride on top of it as an unpainted smudge.
 */
function hardwareAlpha(rgb, n) {
  const a = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const L = (0.2126 * rgb[i * 3] + 0.7152 * rgb[i * 3 + 1] + 0.0722 * rgb[i * 3 + 2]) / 255;
    a[i] = Math.max(0, Math.min(255, ((0.38 - L) / 0.10) * 255));
  }
  return a;
}

/**
 * Cut away whatever sits above the architrave.
 *
 * The teal key handles the sides, because the sides are teal. The top is not:
 * every door in the set was shot against marble tile, and marble is a bright
 * near-neutral, same as a white architrave. No colour rule separates them.
 *
 * What does separate them is the shadow seam where the two meet — the darkest
 * thing in that band, present in every shot. The frame's head is a shallow arc
 * (the camera sat low), so the cut has to follow a curve, not a straight line —
 * a rectangle keeps marble in the middle or clips the mouldings at the corners.
 *
 * But the raw per-column darkest pixel is noisy: a fleck of grout one column
 * over sits a few pixels higher than its neighbour, and cutting each column to
 * its own darkest row leaves a torn-paper edge across the top of every frame.
 * So the seam is found per column and then SMOOTHED — a wide median kills the
 * outliers, a short average takes the stair-steps off — before anything is cut.
 * The result is the arc the frame actually has, without the noise the pixels
 * happened to carry.
 */
function trimAboveSeam(alpha, rgb, w, h, innerTop) {
  const band = Math.max(1, innerTop);
  const seam = new Int32Array(w);
  for (let x = 0; x < w; x++) {
    let best = 0;
    let darkest = Infinity;
    for (let y = 0; y < band; y++) {
      const i = (y * w + x) * 3;
      const L = 0.2126 * rgb[i] + 0.7152 * rgb[i + 1] + 0.0722 * rgb[i + 2];
      if (L < darkest) {
        darkest = L;
        best = y;
      }
    }
    seam[x] = best;
  }

  // Median over a wide window rejects the grout flecks; the columns that picked a
  // wrong seam are a minority and the median ignores them.
  const med = new Int32Array(w);
  const R = Math.max(4, Math.round(w * 0.03));
  const win = [];
  for (let x = 0; x < w; x++) {
    win.length = 0;
    for (let d = -R; d <= R; d++) win.push(seam[Math.max(0, Math.min(w - 1, x + d))]);
    win.sort((a, b) => a - b);
    med[x] = win[win.length >> 1];
  }

  // A short box average then takes the last stair-steps off, so the cut is a
  // clean curve rather than a set of plateaus.
  const smooth = new Int32Array(w);
  const A = 3;
  for (let x = 0; x < w; x++) {
    let s = 0, c = 0;
    for (let d = -A; d <= A; d++) {
      const xx = x + d;
      if (xx >= 0 && xx < w) { s += med[xx]; c++; }
    }
    // +1 keeps the shadow line itself on the cut side of the edge
    smooth[x] = Math.round(s / c) + 1;
  }

  // Feather the cut instead of slicing it hard. The architrave head is a thin
  // strip and its top is where the paint met marble grout, so a hard cut there
  // reads as a torn edge. A short vertical ramp turns it into a soft top — which
  // is what the head of a door set into a reveal actually looks like, shadowed
  // by the wall above it rather than crisply lit.
  const FEATHER = 7;
  for (let x = 0; x < w; x++) {
    const cut = Math.min(band - 1, smooth[x]);
    for (let y = 0; y <= cut; y++) alpha[y * w + x] = 0;
    for (let f = 1; f <= FEATHER; f++) {
      const y = cut + f;
      if (y >= h) break;
      const t = f / (FEATHER + 1);
      const i = y * w + x;
      alpha[i] = Math.round(alpha[i] * t);
    }
  }
}

/** Knock the leaf's rectangle out of the frame ring. */
function ringAlpha(base, w, h, inner) {
  const a = Uint8Array.from(base);
  for (let y = inner.top; y < inner.top + inner.height; y++) {
    if (y < 0 || y >= h) continue;
    for (let x = inner.left; x < inner.left + inner.width; x++) {
      if (x < 0 || x >= w) continue;
      a[y * w + x] = 0;
    }
  }
  return a;
}

async function rawOf(pipeline) {
  const { data, info } = await pipeline.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { rgb: data, w: info.width, h: info.height, n: info.width * info.height };
}

for (const src of SOURCES) {
  const dir = path.join(OUT_DIR, src.id);
  fs.mkdirSync(dir, { recursive: true });

  const upright = () => sharp(path.join(RAW_DIR, src.file)).rotate(90);
  /**
   * Nothing is mirrored. Each leaf keeps the hand it was built with and `hinge`
   * travels as metadata instead — which is what SPEC §5's handle_anchor.side is
   * for. Flipping a leaf to make the carousel tidy drags whatever the hardware
   * cutout happened to overlap along with it, and on the flush door that is the
   * inlay running behind the handle.
   */

  const sx = CANON.w / src.leaf.width;
  const sy = CANON.h / src.leaf.height;

  // ---------- HARDWARE ----------
  // Done first: the leaf mask is cut by the hardware's actual silhouette, not by
  // its bounding box, so the leaf stays continuous right up to the metal.
  //
  // The metal is never tinted. It is black anodised steel and the §5 trick is
  // for painted surfaces. Handle swapping comes later off its own photographs —
  // for now each model wears the handle it was shot with.
  const hwOut = [];
  const hwAlphas = [];
  for (let i = 0; i < src.hardware.length; i++) {
    const hw = src.hardware[i];
    const w = Math.max(1, Math.round(hw.width * sx));
    const h = Math.max(1, Math.round(hw.height * sy));
    const { data } = await upright()
      .extract(hw)
      .resize(w, h, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const alpha = hardwareAlpha(data, w * h);

    // Neutralise the teal cast. The showroom wall throws cyan onto everything,
    // and the leaf does not care — its passes come from luminance, which has no
    // hue. The hardware does care: it is the only layer that keeps its original
    // RGB, and black anodised steel measured (22,33,42) here — twice as much
    // blue as red. Left alone it reads as a blue handle on a walnut door.
    //
    // Balance against the hardware's own mean rather than a fixed matrix, so
    // each photograph corrects for the cast it actually has.
    let sr = 0, sg = 0, sb = 0, sn = 0;
    for (let p = 0; p < w * h; p++) {
      if (alpha[p] > 200) { sr += data[p * 3]; sg += data[p * 3 + 1]; sb += data[p * 3 + 2]; sn++; }
    }
    const target = sn ? (LUMA[0] * sr + LUMA[1] * sg + LUMA[2] * sb) / sn : 1;
    const gain = sn
      ? [target / Math.max(1, sr / sn), target / Math.max(1, sg / sn), target / Math.max(1, sb / sn)]
      : [1, 1, 1];

    const rgba = Buffer.alloc(w * h * 4);
    for (let p = 0; p < w * h; p++) {
      for (let c = 0; c < 3; c++) {
        rgba[p * 4 + c] = Math.max(0, Math.min(255, data[p * 3 + c] * gain[c]));
      }
      rgba[p * 4 + 3] = alpha[p];
    }
    const file = `hardware_${i}.png`;
    await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
      .png()
      .toFile(path.join(dir, file));

    const x = Math.round((hw.left - src.leaf.left) * sx);
    const y = Math.round((hw.top - src.leaf.top) * sy);
    hwOut.push({ file, x, y, w, h });
    hwAlphas.push({ alpha, x, y, w, h });
  }

  // ---------- LEAF ----------
  // Resampled to CANON. Every model ends up the same size, so the wall opening
  // fits one rect and handles land on one anchor.
  const leafPipe = upright().extract(src.leaf).resize(CANON.w, CANON.h, { fit: 'fill' });
  const leaf = await rawOf(leafPipe);

  // Rect, minus the hardware silhouettes.
  const lAlpha = new Uint8Array(leaf.n).fill(255);
  for (const hw of hwAlphas) {
    for (let yy = 0; yy < hw.h; yy++) {
      const y = hw.y + yy;
      if (y < 0 || y >= leaf.h) continue;
      for (let xx = 0; xx < hw.w; xx++) {
        const x = hw.x + xx;
        if (x < 0 || x >= leaf.w) continue;
        const keep = 255 - hw.alpha[yy * hw.w + xx];
        const i = y * leaf.w + x;
        if (keep < lAlpha[i]) lAlpha[i] = keep;
      }
    }
  }
  const lp = derivePasses(leaf.rgb, leaf.w, leaf.h, { alpha: lAlpha });
  await planeToPng(lp.BASE, lAlpha, leaf.w, leaf.h, BASE_SCALE).toFile(path.join(dir, 'leaf_base.png'));
  await aoToPng(lp.AO, leaf.w, leaf.h).toFile(path.join(dir, 'leaf_ao.png'));
  await planeToPng(lp.SPEC, lAlpha, leaf.w, leaf.h, 255).toFile(path.join(dir, 'leaf_spec.png'));
  await planeToPng(new Float32Array(leaf.n).fill(1), lAlpha, leaf.w, leaf.h, 255)
    .toFile(path.join(dir, 'leaf_mask.png'));

  // ---------- FRAME ----------
  // Normalised so its INNER opening lands exactly on CANON — that is what lets
  // any frame pair with any leaf without a combination photo.
  const fo = src.frameOuter;
  const fw = Math.round(fo.width * sx);
  const fh = Math.round(fo.height * sy);
  const inner = {
    left: Math.round((src.leaf.left - fo.left) * sx),
    top: Math.round((src.leaf.top - fo.top) * sy),
    width: CANON.w,
    height: CANON.h,
  };

  const framePipe = upright().extract(fo).resize(fw, fh, { fit: 'fill' });
  const frame = await rawOf(framePipe);
  // Sampled off the WHOLE photograph, not the frame box. The box hugs the
  // architrave by design, so it barely contains any wall — sampling inside it
  // just finds the least neutral pixels of the frame itself and calls that the
  // backing (it read sat 0.11 on the white door).
  const plate = await rawOf(upright().resize(400));
  const backing = sampleBacking(plate.rgb, plate.n);
  const keyed = erodeAlpha(wallAlpha(frame.rgb, frame.n, backing), frame.w, frame.h, 2);
  const fAlpha = ringAlpha(keyed, frame.w, frame.h, inner);
  trimAboveSeam(fAlpha, frame.rgb, frame.w, frame.h, inner.top);
  console.log(
    `${src.id.padEnd(9)} backing hue=${backing.hue.toFixed(0)} sat=${backing.sat.toFixed(2)}`
  );

  const fp = derivePasses(frame.rgb, frame.w, frame.h, { alpha: fAlpha });
  await planeToPng(fp.BASE, fAlpha, frame.w, frame.h, BASE_SCALE).toFile(path.join(dir, 'frame_base.png'));
  await aoToPng(fp.AO, frame.w, frame.h).toFile(path.join(dir, 'frame_ao.png'));
  await planeToPng(fp.SPEC, fAlpha, frame.w, frame.h, 255).toFile(path.join(dir, 'frame_spec.png'));
  await planeToPng(new Float32Array(frame.n).fill(1), fAlpha, frame.w, frame.h, 255)
    .toFile(path.join(dir, 'frame_mask.png'));

  const meta = {
    id: src.id,
    geometry: src.geometry,
    naqsh: src.naqsh,
    hinge: src.hinge,
    frameStyle: src.frameStyle,
    canon: CANON,
    frame: { width: fw, height: fh, inner },
    hardware: hwOut,
  };
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  console.log(`${src.id.padEnd(9)} leaf ${CANON.w}x${CANON.h}  frame ${fw}x${fh} inner@${inner.left},${inner.top}`);
}

if (previewDir) {
  fs.mkdirSync(previewDir, { recursive: true });
  console.log('\npreview -> run tools/preview.mjs');
}
