/**
 * CPU rehearsal of what the Pixi shader will do, so the asset extraction can be
 * judged without a browser in the loop.
 *
 *   node tools/preview.mjs <outDir>
 *
 * Sheet 1 — each model in its own frame, a few tints.
 * Sheet 2 — the frame-pairing check: one leaf worn by every frame in the set.
 *           If this reads wrong, the frame is not a real axis and step 3 goes
 *           back to being colour + handle only.
 */
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs';
import { OUT_DIR, CANON, SOURCES } from './sources.mjs';
import { BASE_SCALE } from './passes.mjs';

const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });

const TINTS = {
  white: [0.906, 0.886, 0.839],
  walnut: [0.294, 0.212, 0.137],
  graphite: [0.231, 0.243, 0.259],
  teal: [0.043, 0.404, 0.427],
  brass: [0.541, 0.439, 0.282],
};

const cache = new Map();
async function loadPart(id, part) {
  const key = id + '/' + part;
  if (cache.has(key)) return cache.get(key);
  const dir = path.join(OUT_DIR, id);
  const read = async (f) => {
    const { data, info } = await sharp(path.join(dir, f)).raw().toBuffer({ resolveWithObject: true });
    return { data, w: info.width, h: info.height, ch: info.channels };
  };
  const v = {
    base: await read(`${part}_base.png`),
    ao: await read(`${part}_ao.png`),
    spec: await read(`${part}_spec.png`),
  };
  cache.set(key, v);
  return v;
}

/** The §5 formula, on the CPU. Returns premultiplied RGBA. */
function shade({ base, ao, spec }, tint) {
  const { w, h, ch } = base;
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = base.data[i * ch + 3];
    if (!a) continue;
    const bv = base.data[i * ch] / BASE_SCALE;
    const av = ao.data[i * ch] / 255;
    const sv = spec.data[i * ch] / 255;
    for (let c = 0; c < 3; c++) {
      const v = tint[c] * bv * av + sv;
      out[i * 4 + c] = Math.max(0, Math.min(255, v * 255));
    }
    out[i * 4 + 3] = a;
  }
  return sharp(out, { raw: { width: w, height: h, channels: 4 } });
}

/** Composite one door: frame ring, then leaf into its opening, then hardware. */
async function renderDoor({ leafId, frameId, leafTint, frameTint }) {
  const fmeta = JSON.parse(fs.readFileSync(path.join(OUT_DIR, frameId, 'meta.json'), 'utf8'));
  const lmeta = JSON.parse(fs.readFileSync(path.join(OUT_DIR, leafId, 'meta.json'), 'utf8'));

  const frame = await shade(await loadPart(frameId, 'frame'), frameTint);
  const leaf = await shade(await loadPart(leafId, 'leaf'), leafTint);

  const W = fmeta.frame.width, H = fmeta.frame.height;
  const layers = [
    // the dark void behind the leaf — SPEC §5 layer 1, sells depth
    {
      input: Buffer.from(
        `<svg width="${W}" height="${H}"><rect x="${fmeta.frame.inner.left - 6}" y="${fmeta.frame.inner.top - 6}" ` +
        `width="${CANON.w + 12}" height="${CANON.h + 12}" fill="#171208"/></svg>`
      ),
      top: 0, left: 0,
    },
    { input: await leaf.png().toBuffer(), top: fmeta.frame.inner.top, left: fmeta.frame.inner.left },
    { input: await frame.png().toBuffer(), top: 0, left: 0 },
  ];

  for (const hw of lmeta.hardware) {
    layers.push({
      input: await sharp(path.join(OUT_DIR, leafId, hw.file)).resize(hw.w, hw.h, { fit: 'fill' }).png().toBuffer(),
      top: fmeta.frame.inner.top + hw.y,
      left: fmeta.frame.inner.left + hw.x,
    });
  }

  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(layers).png().toBuffer();
}

const CELL_W = 300, LBL = 26;
async function sheet(cells, file, cols) {
  const CELL_H = 760;
  const comp = [];
  for (let i = 0; i < cells.length; i++) {
    const img = await sharp(cells[i].buf)
      .resize(CELL_W - 10, CELL_H - LBL - 10, { fit: 'contain', background: '#2a2a2a' })
      .toBuffer();
    comp.push({ input: img, top: Math.floor(i / cols) * CELL_H + LBL + 5, left: (i % cols) * CELL_W + 5 });
    comp.push({
      input: Buffer.from(
        `<svg width="${CELL_W}" height="${LBL}"><rect width="${CELL_W}" height="${LBL}" fill="#111"/>` +
        `<text x="6" y="18" font-family="monospace" font-size="14" fill="#0f0">${cells[i].label}</text></svg>`
      ),
      top: Math.floor(i / cols) * CELL_H, left: (i % cols) * CELL_W,
    });
  }
  const out = path.join(OUT, file);
  await sharp({
    create: { width: cols * CELL_W, height: Math.ceil(cells.length / cols) * CELL_H, channels: 3, background: '#2a2a2a' },
  }).composite(comp).jpeg({ quality: 90 }).toFile(out);
  console.log('wrote', out);
}

// Sheet 1 — every model, in its own frame.
const s1 = [];
for (const src of SOURCES) {
  for (const t of ['white', 'walnut', 'graphite']) {
    s1.push({
      label: `${src.id} / ${t}`,
      buf: await renderDoor({ leafId: src.id, frameId: src.id, leafTint: TINTS[t], frameTint: TINTS.white }),
    });
  }
}
await sheet(s1, 'models.jpg', 3);

// Sheet 2 — the pairing check. One leaf, every frame.
const s2 = [];
for (const src of SOURCES) {
  s2.push({
    label: `leaf:hexagon / frame:${src.frameStyle}(${src.id})`,
    buf: await renderDoor({ leafId: 'hexagon', frameId: src.id, leafTint: TINTS.walnut, frameTint: TINTS.white }),
  });
}
await sheet(s2, 'pairing.jpg', 5);
