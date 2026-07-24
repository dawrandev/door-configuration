/**
 * Turn finished interior renders into configurator rooms.
 *
 *   node tools/rooms.mjs
 *
 * Each render already contains a door, and for a configurator that door is in
 * the way: a leaf laid over it that misses by a pixel lets the original's bright
 * white edge show, and that halo dogged this project for a long time. Replacing
 * the opening with an unlit recess fixes it at the root — a miss now shows DARK,
 * and a dark sliver beside a door is not an artefact, it is the shadow gap that
 * is really there.
 *
 * Everything else in the render stays: casing, architrave, skirting, floor,
 * lighting, styling. Those belong to the room, not to the door, and they are why
 * the composite looks photographed rather than assembled.
 */
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs';

const SCENE = 'd:/laragon/www/door configurator/kiosk/public/assets/scene';
const AI = 'd:/laragon/www/door configurator/rooms-ai';
const OUT = 'd:/laragon/www/door configurator/kiosk/public/assets/rooms';
const SHEET = 'd:/laragon/www/door configurator/kiosk/tools/_rooms-contact.jpg';

/**
 * The rooms, with the opening each one already has.
 *
 * Openings are fractions of the image and were measured in the workshop's own
 * cropping bench (#/admin/kesish) — not estimated. That is why they can be
 * trusted to the pixel here.
 */
const ROOMS = [
  {
    id: 'living', file: 'elita-line-room.jpg',
    name: { uz: 'Yashash xonasi', kk: 'Jasaw bólmesi', ru: 'Гостиная' },
    open: { x: 0.28625, y: 0.14869, w: 0.45062, h: 0.77251 },
  },
  {
    id: 'rose', file: 'elita-romb-room.jpg',
    name: { uz: 'Pushti xona', kk: 'Qızğılt bólme', ru: 'Розовая комната' },
    open: { x: 0.2625, y: 0.10657, w: 0.49812, h: 0.87324 },
  },
  {
    id: 'bedroom', file: 'elita-klassik-room.jpg',
    name: { uz: 'Yotoqxona', kk: 'Jatın bólme', ru: 'Спальня' },
    open: { x: 0.29812, y: 0.17355, w: 0.42375, h: 0.73124 },
  },
  {
    // Measured off this render's own luminance profile — reveals at x 464 and
    // 1114, head gap at y 518, threshold at y 1986 of a 1600x2400 plate. The
    // estimate that stood here before was 3% short in height, which left a
    // band of casing showing under the recess.
    id: 'hall', file: 'elita-oyna-room.jpg',
    name: { uz: 'Kirish xonasi', kk: 'Kiriw bólme', ru: 'Прихожая' },
    open: { x: 0.29, y: 0.21583, w: 0.40625, h: 0.61167 },
  },
  {
    /**
     * Generated, and it passed the test the others had to pass.
     *
     * The doorway was traced at four heights and measured 201→370 at every one
     * of them: parallel, vertical, a true rectangle. That is the thing a
     * generator usually gets wrong and the one thing that cannot be corrected
     * afterwards, so it was checked before the room was accepted rather than
     * after. Its opening is already empty; the recess is repainted anyway so
     * every room's doorway reads the same depth.
     *
     * Honest limit: 572x1024 is a quarter the resolution of the renders, and it
     * will look softer on a large screen. Worth having, worth regenerating
     * larger.
     */
    id: 'oak', file: 'ai-01.jpg', dir: AI,
    name: { uz: 'Eman zal', kk: 'Emen zal', ru: 'Дубовый зал' },
    open: { x: 201 / 572, y: 298 / 1024, w: 169 / 572, h: 454 / 1024 },
  },
];

fs.mkdirSync(OUT, { recursive: true });
const done = [];

for (const r of ROOMS) {
  const src = sharp(path.join(r.dir ?? SCENE, r.file));
  const meta = await src.metadata();
  const W = meta.width, H = meta.height;
  const ox = Math.round(r.open.x * W), oy = Math.round(r.open.y * H);
  const ow = Math.round(r.open.w * W), oh = Math.round(r.open.h * H);

  /**
   * The colour of the light in this room.
   *
   * A leaf is normalised to a neutral white so every door agrees on what white
   * is — but a neutral white door dropped into a warm room reads cold and pasted,
   * because everything else in that room is warm. The white CASING carries no
   * warmth (it is white trim, close to neutral by design), so the room's warmth
   * is read off the WALL beside the opening: a broad patch, well clear of the
   * casing, its median colour normalised to its own luminance. That median IS
   * the ambient the app tints the door with — the same paint, relit to belong.
   * A gentle exponent keeps the shift felt, not seen, so the door warms without
   * turning beige.
   */
  // A fresh instance: a sharp pipeline is single-use, and sampling off `src`
  // would consume it before the composite below.
  const wallX = Math.max(0, ox - Math.round(ow * 0.55));
  const { data: rgb, info: ri } = await sharp(path.join(r.dir ?? SCENE, r.file)).extract({
    left: wallX,
    top: oy + Math.round(oh * 0.05),
    width: Math.max(8, Math.round(ow * 0.30)),
    height: Math.round(oh * 0.5),
  }).raw().toBuffer({ resolveWithObject: true });
  const chan = [[], [], []];
  for (let i = 0; i < rgb.length; i += ri.channels) {
    const l = 0.2126 * rgb[i] + 0.7152 * rgb[i + 1] + 0.0722 * rgb[i + 2];
    if (l < 120 || l > 245) continue; // skip shadow and any blown highlight
    for (let c = 0; c < 3; c++) chan[c].push(rgb[i + c]);
  }
  const median = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1] || 1; };
  const wall = chan.map(median);
  const wl = (wall[0] + wall[1] + wall[2]) / 3;
  // multiplier, normalised to its own brightness so it only shifts hue; the
  // 0.55 exponent halves the strength so the relight is felt, not seen
  const light = wall.map((v) => +Math.pow(v / wl, 0.55).toFixed(4));

  /**
   * The recess.
   *
   * Not flat black. An unlit doorway is darkest at its head and along the hinge
   * side, and picks up a little bounce off the floor at the threshold. Painting
   * that gradient costs nothing and is the whole difference between reading as
   * "a hole cut in the picture" and "a room you cannot see into" — which matters
   * on the doors that do not quite fill their opening.
   */
  const recess = Buffer.alloc(ow * oh * 3);
  for (let y = 0; y < oh; y++) {
    const v = y / oh;
    for (let x = 0; x < ow; x++) {
      const u = x / ow;
      const bounce = Math.pow(v, 3) * 26; // light off the floor beyond
      const sideFall = 1 - 0.35 * Math.pow(1 - u, 2); // darker toward the hinge
      const base = (16 + bounce) * sideFall;
      const i = (y * ow + x) * 3;
      recess[i] = base * 0.95;
      recess[i + 1] = base * 0.97;
      recess[i + 2] = base; // a hair cool, as shadow is
    }
  }
  const patch = await sharp(recess, { raw: { width: ow, height: oh, channels: 3 } }).png().toBuffer();

  const file = path.join(OUT, `${r.id}.jpg`);
  await src.composite([{ input: patch, left: ox, top: oy }]).jpeg({ quality: 92, mozjpeg: true }).toFile(file);

  console.log(`✓ ${r.id.padEnd(8)} ${W}x${H}  opening ${ow}x${oh}  light ${light.map((v) => v.toFixed(2)).join('/')}`);
  done.push({ ...r, file, W, H, light });
}

const tsOut = `// GENERATED by tools/rooms.mjs — do not edit by hand.
// Re-run: node tools/rooms.mjs
import type { Room } from './types';

export const ROOMS: Room[] = [
${done
  .map(
    (r) => `  {
    id: '${r.id}',
    name: { uz: '${r.name.uz}', kk: '${r.name.kk}', ru: '${r.name.ru}' },
    image: '/assets/rooms/${r.id}.jpg',
    aspect: ${(r.W / r.H).toFixed(5)},
    /** the doorway, as fractions of the image — measured, never estimated */
    open: { x: ${r.open.x}, y: ${r.open.y}, w: ${r.open.w}, h: ${r.open.h} },
    /** the room's own light, as an RGB multiplier — relights the door to belong */
    light: [${r.light.join(', ')}],
  },`
  )
  .join('\n')}
];
`;
fs.writeFileSync('d:/laragon/www/door configurator/kiosk/src/catalog/rooms.generated.ts', tsOut);
console.log('catalogue → src/catalog/rooms.generated.ts');

const TW = 380;
const tiles = [];
for (let i = 0; i < done.length; i++) {
  const b = await sharp(done[i].file).resize({ width: TW }).toBuffer();
  const m = await sharp(b).metadata();
  tiles.push({ input: b, left: i * (TW + 10), top: 0, h: m.height });
}
await sharp({
  create: { width: done.length * (TW + 10), height: Math.max(...tiles.map((t) => t.h)), channels: 3, background: '#1b1a18' },
}).composite(tiles.map(({ input, left, top }) => ({ input, left, top }))).jpeg({ quality: 88 }).toFile(SHEET);

console.log(`\ncontact sheet → ${SHEET}`);
console.log(`${done.length} rooms prepared`);
