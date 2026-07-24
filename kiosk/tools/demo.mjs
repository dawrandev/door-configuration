/**
 * Builds catalog models from clean, dead-on, evenly-lit door product shots — the
 * Pirnar-style studio renders the CTO pointed at: a modern door isolated on a
 * near-white backdrop. That is the ideal input for the §5 pipeline, so these
 * read as real painted doors rather than fighting the shadows and perspective of
 * a snapshot.
 *
 *   node tools/demo.mjs
 *
 * Leaf-only: the wall opening's reveal is the surround. Each leaf keeps its own
 * proportion (height fixed, width from the source aspect), so a wide entrance
 * door is not squished into an interior door's rectangle — DoorScene sizes the
 * leaf from the frame opening, not a global constant.
 *
 * These photos are DEMONSTRATION ONLY — reference product images, not licensed
 * to ship in a commercial catalogue. They stand in until the workshop supplies
 * its own dead-on, evenly-lit shots; replacing them is editing this one list.
 */
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs';
import { derivePasses, planeToPng, aoToPng, BASE_SCALE } from './passes.mjs';

const OUT_DIR = 'd:/laragon/www/door configurator/kiosk/public/assets/doors';
const SRC_DIR = 'd:/laragon/www/door configurator/modern-doors';
const H = 2400; // canonical leaf height; width follows the source aspect

// The Pirnar renders are framed almost identically, so one box fits them; the
// door sits ~28px in from each side, ~12 from the top, above the floor sill.
const BOX = { left: 28, top: 12, width: 924, height: 1735 };

const MODELS = [
  { id: 'modern-glass', file: 'p-7160.jpg', name: { uz: 'Shisha panel', kk: 'Áynek panel', ru: 'Стеклянная панель' }, basePrice: 4_200_000 },
  { id: 'modern-strip', file: 'p-7300.jpg', name: { uz: 'Vertikal chiziq', kk: 'Vertikal sızıq', ru: 'Вертикальная вставка' }, basePrice: 3_900_000 },
  { id: 'modern-squares', file: 'p-7450.jpg', name: { uz: 'Kvadratlar', kk: 'Kvadratlar', ru: 'Квадраты' }, basePrice: 4_500_000 },
  { id: 'modern-line', file: 'p-7470.jpg', name: { uz: 'Chiziqli', kk: 'Sızıqlı', ru: 'Линейная' }, basePrice: 4_100_000 },
  { id: 'modern-minimal', file: 'p-7500.jpg', name: { uz: 'Minimal', kk: 'Minimal', ru: 'Минимал' }, basePrice: 3_700_000 },
];

async function rawOf(pipe) {
  const { data, info } = await pipe.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { rgb: data, w: info.width, h: info.height, n: info.width * info.height };
}

const out = [];
for (const m of MODELS) {
  const dir = path.join(OUT_DIR, m.id);
  fs.mkdirSync(dir, { recursive: true });

  // width from the source aspect, so nothing is stretched
  const W = Math.round((H * BOX.width) / BOX.height);

  const leaf = await rawOf(
    sharp(path.join(SRC_DIR, m.file)).extract(BOX).resize(W, H, { fit: 'fill' })
  );
  const alpha = new Uint8Array(leaf.n).fill(255);
  const lp = derivePasses(leaf.rgb, leaf.w, leaf.h, { alpha });
  await planeToPng(lp.BASE, alpha, leaf.w, leaf.h, BASE_SCALE).toFile(path.join(dir, 'leaf_base.png'));
  await aoToPng(lp.AO, leaf.w, leaf.h).toFile(path.join(dir, 'leaf_ao.png'));
  await planeToPng(lp.SPEC, alpha, leaf.w, leaf.h, 255).toFile(path.join(dir, 'leaf_spec.png'));
  await planeToPng(new Float32Array(leaf.n).fill(1), alpha, leaf.w, leaf.h, 255).toFile(path.join(dir, 'leaf_mask.png'));

  // empty frame (leaf-only), sized to the leaf so DoorScene's opening matches
  const empty = new Uint8Array(4).fill(0);
  for (const p of ['base', 'ao', 'spec', 'mask']) {
    await sharp(Buffer.from(empty), { raw: { width: 1, height: 1, channels: 4 } }).png().toFile(path.join(dir, `frame_${p}.png`));
  }

  // ---- GLASS ----
  // The frosted insert is a material, not paint — Pirnar keeps it translucent
  // whatever colour the door is, and so do we. It reads as bright and cool
  // (bluer than the door body); pulled out as its own untinted sprite, it
  // composites over the tinted leaf so a graphite door still has light glass.
  // Restricted to the door's right two-thirds so the chrome handle's blue
  // reflections on the left do not get mistaken for glass.
  const glass = Buffer.alloc(leaf.n * 4);
  let hasGlass = 0;
  for (let i = 0; i < leaf.n; i++) {
    const r = leaf.rgb[i * 3], g = leaf.rgb[i * 3 + 1], b = leaf.rgb[i * 3 + 2];
    const L = (r + g + b) / 3 / 255;
    const cool = b - r;
    const x = (i % leaf.w) / leaf.w;
    const isGlass = L > 0.45 && L < 0.93 && cool > 6 && x > 0.28;
    glass[i * 4] = r; glass[i * 4 + 1] = g; glass[i * 4 + 2] = b;
    glass[i * 4 + 3] = isGlass ? 255 : 0;
    if (isGlass) hasGlass++;
  }
  const glassOn = hasGlass > leaf.n * 0.01;
  if (glassOn) {
    // a light median-ish clean: drop lone specks by requiring cardinal neighbours
    const a = new Uint8Array(leaf.n);
    for (let i = 0; i < leaf.n; i++) a[i] = glass[i * 4 + 3];
    for (let y = 1; y < leaf.h - 1; y++) {
      for (let x = 1; x < leaf.w - 1; x++) {
        const i = y * leaf.w + x;
        if (!a[i]) continue;
        const n = a[i - 1] + a[i + 1] + a[i - leaf.w] + a[i + leaf.w];
        if (n < 255 * 2) glass[i * 4 + 3] = 0;
      }
    }
    await sharp(glass, { raw: { width: leaf.w, height: leaf.h, channels: 4 } }).png().toFile(path.join(dir, 'glass.png'));
  }

  out.push({ ...m, W, H, glass: glassOn });
  console.log(`${m.id}: leaf ${W}x${H}${glassOn ? ' +glass' : ''}`);
}

// Emit the catalog fragment so the wired dimensions always match the assets.
const ts = `// GENERATED by tools/demo.mjs — do not edit.
// Demo doors from clean product shots. DEMO ONLY — not licensed to ship.
import type { DoorModel, FrameModel } from './types';

export const DEMO_DOORS: DoorModel[] = ${JSON.stringify(
  out.map((m) => ({
    id: m.id,
    sku: m.id.replace('modern-', 'DK-M-').toUpperCase(),
    name: m.name,
    geometry: 'panelled',
    naqsh: 'none',
    hinge: 'left',
    basePrice: m.basePrice,
    leaf: {
      base: `/assets/doors/${m.id}/leaf_base.png`,
      ao: `/assets/doors/${m.id}/leaf_ao.png`,
      spec: `/assets/doors/${m.id}/leaf_spec.png`,
      mask: `/assets/doors/${m.id}/leaf_mask.png`,
    },
    hardware: [],
    glassLayer: m.glass ? `/assets/doors/${m.id}/glass.png` : undefined,
    allows: { frames: [`${m.id}-frame`], glass: [] },
  })),
  null,
  2
)};

export const DEMO_FRAMES: FrameModel[] = ${JSON.stringify(
  out.map((m) => ({
    id: `${m.id}-frame`,
    name: { uz: 'Ochiq', kk: 'Ashıq', ru: 'Проём' },
    style: 'none',
    passes: {
      base: `/assets/doors/${m.id}/frame_base.png`,
      ao: `/assets/doors/${m.id}/frame_ao.png`,
      spec: `/assets/doors/${m.id}/frame_spec.png`,
      mask: `/assets/doors/${m.id}/frame_mask.png`,
    },
    width: m.W,
    height: m.H,
    inner: { left: 0, top: 0, width: m.W, height: m.H },
    priceDelta: 0,
  })),
  null,
  2
)};
`;
fs.writeFileSync('d:/laragon/www/door configurator/kiosk/src/catalog/demoDoors.generated.ts', ts);
console.log('\nwrote src/catalog/demoDoors.generated.ts');
