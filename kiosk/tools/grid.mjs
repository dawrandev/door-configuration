/**
 * Renders each source upright with a coordinate grid burned in, so the boxes in
 * sources.mjs can be read straight off the image. Labels are in ORIGINAL
 * (rotated) pixels, not preview pixels — what you read is what you type.
 *
 *   node tools/grid.mjs <outDir>
 */
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs';
import { RAW_DIR, SOURCES } from './sources.mjs';

const OUT = process.argv[2];
const PREVIEW_W = 620;
const STEP = 200; // original px between grid lines

fs.mkdirSync(OUT, { recursive: true });

for (const src of SOURCES) {
  const up = sharp(path.join(RAW_DIR, src.file)).rotate(90);
  const { info } = await up.clone().toBuffer({ resolveWithObject: true });
  const [ow, oh] = [info.width, info.height];
  const scale = PREVIEW_W / ow;
  const pw = PREVIEW_W;
  const ph = Math.round(oh * scale);

  const img = await up.clone().resize(pw).toBuffer();

  let lines = '';
  for (let x = 0; x <= ow; x += STEP) {
    const px = Math.round(x * scale);
    const major = x % 1000 === 0;
    lines += `<line x1="${px}" y1="0" x2="${px}" y2="${ph}" stroke="${major ? '#ff0' : '#0f0'}" stroke-width="${major ? 1.2 : 0.4}" opacity="${major ? 0.9 : 0.45}"/>`;
    if (major) lines += `<text x="${px + 3}" y="14" font-family="monospace" font-size="12" fill="#ff0">${x}</text>`;
  }
  for (let y = 0; y <= oh; y += STEP) {
    const py = Math.round(y * scale);
    const major = y % 1000 === 0;
    lines += `<line x1="0" y1="${py}" x2="${pw}" y2="${py}" stroke="${major ? '#ff0' : '#0f0'}" stroke-width="${major ? 1.2 : 0.4}" opacity="${major ? 0.9 : 0.45}"/>`;
    if (major) lines += `<text x="3" y="${py - 3}" font-family="monospace" font-size="12" fill="#ff0">${y}</text>`;
  }

  const overlay = Buffer.from(`<svg width="${pw}" height="${ph}">${lines}</svg>`);
  const out = path.join(OUT, `grid_${src.id}.jpg`);
  await sharp(img).composite([{ input: overlay }]).jpeg({ quality: 90 }).toFile(out);
  console.log(`${src.id.padEnd(10)} ${src.file}  upright ${ow}x${oh}  -> ${out}`);
}
