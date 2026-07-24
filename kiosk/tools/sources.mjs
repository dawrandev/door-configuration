/**
 * Which photograph backs which door model, and where the parts sit in it.
 *
 * All 39 shots came off the camera on their side, so every source is rotated
 * upright before anything else touches it. Boxes are in the ROTATED frame and
 * were measured against the overlay from `grid.mjs`. Eyeballing six models is
 * honest; eyeballing sixty would not be, which is what SPEC §7's alignment UI
 * is for. This table is the shape that UI will eventually write.
 */

export const RAW_DIR = 'd:/laragon/www/door configurator/raw-photos';
export const OUT_DIR = 'd:/laragon/www/door configurator/kiosk/public/assets/doors';

/**
 * Canonical leaf size. Every leaf is resampled to exactly this, and every
 * frame is resampled so its INNER OPENING is exactly this.
 *
 * That is what makes the frame a real customisation axis: the frame ring and
 * the leaf never share a pixel, so once both are normalised to the same
 * opening, any frame composites onto any leaf with no extra photography. The
 * per-model aspect ratios in the sources range 0.381–0.435 — that spread is
 * camera distance, not millimetres, and flattening it costs a few percent of
 * width on a door nobody is measuring with calipers.
 */
export const CANON = { w: 1000, h: 2400 };

export const SOURCES = [
  {
    id: 'hexagon',
    file: 'GD8A6640.JPG',
    geometry: 'panelled',
    /** Milled INTO the leaf — geometry, not an overlay. Hence: part of the model. */
    naqsh: 'hexagon',
    hinge: 'left',
    leaf: { left: 608, top: 228, width: 2228, height: 5394 },
    frameOuter: { left: 424, top: 136, width: 2536, height: 5650 },
    /** Cut out of the leaf mask so the tint cannot reach the black hardware. */
    hardware: [{ left: 2240, top: 2420, width: 560, height: 420 }],
    frameStyle: 'flat',
    note: 'Cleanest dead-on shot of the set. Flat minimal frame.',
  },
  {
    id: 'lattice',
    file: 'GD8A6670.JPG',
    geometry: 'panelled',
    naqsh: 'lattice',
    hinge: 'left',
    leaf: { left: 706, top: 174, width: 1994, height: 5234 },
    frameOuter: { left: 516, top: 152, width: 2390, height: 5527 },
    hardware: [{ left: 2160, top: 2200, width: 560, height: 470 }],
    frameStyle: 'fluted',
    note: 'Matte white — best base extraction of the set.',
  },
  {
    id: 'classic',
    file: 'GD8A6656.JPG',
    geometry: 'panelled',
    naqsh: 'none',
    hinge: 'left',
    leaf: { left: 679, top: 206, width: 2118, height: 5389 },
    frameOuter: { left: 391, top: 109, width: 2569, height: 5731 },
    hardware: [{ left: 2280, top: 2250, width: 560, height: 470 }],
    frameStyle: 'reeded',
    note: 'Single raised panel, no carving.',
  },
  {
    id: 'twopanel',
    file: 'GD8A6687.JPG',
    geometry: 'panelled',
    naqsh: 'none',
    hinge: 'left',
    leaf: { left: 641, top: 174, width: 2064, height: 5258 },
    frameOuter: { left: 391, top: 98, width: 2542, height: 5769 },
    hardware: [{ left: 2330, top: 2100, width: 520, height: 480 }],
    frameStyle: 'plinth',
    note: 'Two-panel, small over large.',
  },
  {
    id: 'flush',
    file: 'GD8A6622.JPG',
    geometry: 'flush',
    naqsh: 'inlay',
    /**
     * The only right-hinged shot, and it stays that way. Mirroring it looked
     * tidier in the carousel but the leaf's black inlay strips run straight
     * through the handle, so they ride along in the hardware cutout and land
     * flipped onto the wrong side of the door. Both hands are real product; a
     * left-handed door in the lineup is honest, a door with two handles is not.
     */
    hinge: 'right',
    leaf: { left: 903, top: 439, width: 2336, height: 5367 },
    frameOuter: { left: 677, top: 226, width: 2755, height: 5742 },
    hardware: [{ left: 950, top: 3080, width: 560, height: 520 }],
    frameStyle: 'flat',
    note: 'Flat leaf with dark inlay lines. Dimmer exposure than the rest.',
  },
];

/** Shots that are not usable, and why. Kept so nobody re-litigates the cull. */
export const REJECTED = {
  'GD8A6628,GD8A6631,GD8A6646,GD8A6662,GD8A6665,GD8A6680,GD8A6683,GD8A6718,GD8A6722,GD8A6724,GD8A6725':
    'hardware close-up — no full leaf',
  'GD8A6635,GD8A6649,GD8A6650,GD8A6658,GD8A6659,GD8A6672,GD8A6673,GD8A6674,GD8A6675,GD8A6694,GD8A6695,GD8A6711,GD8A6762':
    'door standing open / heavy angle — SPEC §5 needs dead-on',
  GD8A6642: 'same leaf as GD8A6640 but angled',
  'GD8A6690,GD8A6691,GD8A6715': 'leaf cropped by frame edge',
  'GD8A8887,GD8A8888,GD8A8889':
    'rosette leaf, but shot in a hallway: strong perspective, no keyable background, a second door in frame, warm light. Reshoot dead-on against the teal and it is a good model.',
  'GD8A8890,GD8A8891': 'louvered + glass, same hallway problems. Revisit when glass matters.',
  GD8A6731: 'teal leaf but strong perspective down the left stile',
};
