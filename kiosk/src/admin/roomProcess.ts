/**
 * Turn an uploaded room photograph into a configurator room, in the browser.
 *
 * The same two jobs tools/rooms.mjs does offline: replace the doorway with an
 * unlit recess (so a door laid into it covers dark, never another door's bright
 * edge — the halo that dogged this project), and read the room's own light off
 * the wall so the showroom can relight a neutral-white leaf to belong. Both are
 * measured from the pixels; nothing is invented.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ProcessedRoom {
  image: string; // JPEG data URL, recess painted in
  aspect: number;
  light: [number, number, number];
  open: Rect; // fractions, echoed back
}

export function processRoom(img: HTMLImageElement, open: Rect): ProcessedRoom {
  const W = img.width, H = img.height;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);

  const ox = Math.round(open.x * W);
  const oy = Math.round(open.y * H);
  const ow = Math.round(open.w * W);
  const oh = Math.round(open.h * H);

  /**
   * The room's light, read off the wall beside the opening.
   *
   * Not the white casing — that is neutral trim and carries no warmth. A broad
   * patch of wall, its median colour normalised to its own luminance, IS the
   * ambient; a gentle exponent keeps the shift felt, not seen.
   */
  const wallX = Math.max(0, ox - Math.round(ow * 0.55));
  const wallW = Math.max(8, Math.round(ow * 0.3));
  const wallData = ctx.getImageData(wallX, oy + Math.round(oh * 0.05), Math.min(wallW, W - wallX), Math.round(oh * 0.5)).data;
  const chan: number[][] = [[], [], []];
  for (let i = 0; i < wallData.length; i += 4) {
    const l = 0.2126 * wallData[i] + 0.7152 * wallData[i + 1] + 0.0722 * wallData[i + 2];
    if (l < 120 || l > 245) continue;
    for (let c = 0; c < 3; c++) chan[c].push(wallData[i + c]);
  }
  const median = (a: number[]) => { a.sort((p, q) => p - q); return a[a.length >> 1] || 1; };
  const wall = chan.map(median);
  const wlum = (wall[0] + wall[1] + wall[2]) / 3;
  const light = wall.map((v) => +Math.pow(v / wlum, 0.55).toFixed(4)) as [number, number, number];

  /**
   * The recess. Not flat black: an unlit doorway is darkest at its head and
   * hinge side and picks up a little bounce off the floor at the threshold.
   * That gradient is the difference between "a hole cut in the picture" and "a
   * room you cannot see into" — which shows on doors that do not quite fill.
   */
  const recess = ctx.createImageData(ow, oh);
  for (let y = 0; y < oh; y++) {
    const v = y / oh;
    for (let x = 0; x < ow; x++) {
      const u = x / ow;
      const bounce = Math.pow(v, 3) * 26;
      const sideFall = 1 - 0.35 * Math.pow(1 - u, 2);
      const base = (16 + bounce) * sideFall;
      const i = (y * ow + x) * 4;
      recess.data[i] = base * 0.95;
      recess.data[i + 1] = base * 0.97;
      recess.data[i + 2] = base;
      recess.data[i + 3] = 255;
    }
  }
  ctx.putImageData(recess, ox, oy);

  return { image: canvas.toDataURL('image/jpeg', 0.85), aspect: +(W / H).toFixed(5), light, open };
}
