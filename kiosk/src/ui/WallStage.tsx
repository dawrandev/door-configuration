import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useKiosk } from '../store/useKiosk';
import { HANDLE_PLACE, HANDLES } from '../catalog/handles.generated';
import { tintFor, TRIM_SAME, type Tint } from '../catalog/colors';
import { recolorTrim, recolorLeaf, useRender } from '../render/recolor';
import type { Leaf } from '../catalog/types';
import { useElementSize } from './useElementSize';

/** One handle, in black — the finish every door was photographed with. */
const HANDLE_IMAGE = HANDLES.find((h) => h.id === 'black')!.image;
const EASE = 'cubic-bezier(.4, 0, .2, 1)';

/**
 * The stage: a room photograph with the chosen door standing in its doorway.
 *
 * The photograph is fitted whole, so the room is never cropped, and whatever it
 * leaves at the edges is filled with a blurred, scaled copy of itself — a
 * cinema's own trick, and far quieter than a hard letterbox. The doorway behind
 * the leaf is an unlit recess, which is what killed the bright halo: a leaf that
 * misses its opening by a pixel now shows dark, a shadow gap, not a mistake.
 *
 * Doors CROSSFADE as they change: the new leaf rises over the old and the old is
 * then dropped, so a swipe reads as one door dissolving into the next rather
 * than a hard cut. The same trick carries a COLOUR change: the layer's identity
 * is leaf + colour, so repainting fades exactly like swapping a door.
 *
 * The trim — casing ring, and corona above it where the room has one — is
 * recoloured and laid between the room and the door, so it follows the paint
 * while the leaf still covers the casing's inner edge.
 */
export function WallStage({ onSwipe, children }: { onSwipe?: (delta: number) => void; children?: ReactNode }) {
  const roomId = useKiosk((s) => s.roomId);
  const leafId = useKiosk((s) => s.leafId);
  const colorId = useKiosk((s) => s.colorId);
  const trimColorId = useKiosk((s) => s.trimColorId);
  const leaves = useKiosk((s) => s.leaves);
  const rooms = useKiosk((s) => s.rooms);
  const colors = useKiosk((s) => s.colors);
  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];
  const leaf = leaves.find((l) => l.id === leafId) ?? leaves[0];
  const downX = useRef(0);
  const [ref, { width, height }] = useElementSize();

  /** The paint. Null for 'oq' — the door as photographed, no pipeline at all. */
  const paint = tintFor(colorId, colors);
  /** The casing follows the door unless the customer overrode it on step 3. */
  const trimPaint = trimColorId === TRIM_SAME ? paint : tintFor(trimColorId, colors);

  // Preload every door once, so swapping never shows a blank frame first.
  useEffect(() => {
    leaves.forEach((l) => { const im = new Image(); im.src = l.image; });
    const h = new Image(); h.src = HANDLE_IMAGE;
  }, [leaves]);

  // Keep the outgoing layer mounted beneath the incoming one for the length of
  // a crossfade, then prune back to just the current one.
  const current = { leaf, key: `${leaf.id}|${colorId}` };
  const [layers, setLayers] = useState([current]);
  useEffect(() => {
    setLayers((prev) => (prev[prev.length - 1]?.key === current.key ? prev : [...prev.slice(-1), current]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.key]);
  useEffect(() => {
    if (layers.length <= 1) return;
    const t = window.setTimeout(() => setLayers((l) => l.slice(-1)), 380);
    return () => window.clearTimeout(t);
  }, [layers]);

  const trimUrl = useRender(
    () => (trimPaint ? recolorTrim(room, trimPaint) : Promise.resolve(null)),
    '',
    [room, trimColorId, colorId]
  );

  const swipe = {
    onPointerDown: onSwipe ? (e: React.PointerEvent) => (downX.current = e.clientX) : undefined,
    onPointerUp: onSwipe
      ? (e: React.PointerEvent) => {
          const dx = e.clientX - downX.current;
          if (Math.abs(dx) >= 60) onSwipe(dx < 0 ? 1 : -1);
        }
      : undefined,
  };

  // Fit the photograph whole, so the room it shows is never cut off.
  const fitByHeight = width / height > room.aspect;
  const dispW = fitByHeight ? height * room.aspect : width;
  const dispH = fitByHeight ? height : width / room.aspect;
  const offX = (width - dispW) / 2;
  const offY = (height - dispH) / 2;
  const geom = { ox: offX + room.open.x * dispW, oy: offY + room.open.y * dispH, ow: room.open.w * dispW, oh: room.open.h * dispH };

  /**
   * The room's light, as a colour to MULTIPLY the door by. The stored multiplier
   * boosts one channel above 1, which a screen cannot do — multiply only darkens
   * — so it is renormalised to its brightest channel: the warm channel stays,
   * the cool ones come down, and the leaf both warms and loses a little glare,
   * seating it in the room's light instead of reading as a cold cut-out.
   */
  const [lr, lg, lb] = room.light;
  const lmax = Math.max(lr, lg, lb);
  const lightTint = `rgb(${Math.round((lr / lmax) * 255)}, ${Math.round((lg / lmax) * 255)}, ${Math.round((lb / lmax) * 255)})`;

  return (
    <div ref={ref} className="dc-stage" style={{ background: '#ded6ca' }} {...swipe}>
      <div style={{ position: 'absolute', inset: 0, background: `url(${room.image}) center/cover`, filter: 'blur(28px) brightness(.98)', transform: 'scale(1.1)', transition: `background-image 320ms ${EASE}` }} />
      <img src={room.image} alt="" style={{ position: 'absolute', left: offX, top: offY, width: dispW, height: dispH }} />
      {trimUrl && (
        <img src={trimUrl} alt="" draggable={false} style={{ position: 'absolute', left: offX, top: offY, width: dispW, height: dispH, pointerEvents: 'none' }} />
      )}

      {width > 0 && layers.map((l, i) => (
        <DoorLayer key={l.key} leaf={l.leaf} paint={paint} paintKey={colorId} geom={geom} lightTint={lightTint} fade={i === layers.length - 1 && layers.length > 1} />
      ))}
      {children}
    </div>
  );
}

/**
 * One door composite — leaf, the room's light over it, and the handle — as a
 * single fading layer, so all three cross over together.
 *
 * Fitting the leaf at its own proportion and leaving the remainder dark was
 * tried and is worse: a few per cent on each side becomes a black bar that
 * shouts louder than the width difference it avoids. A door and its opening are
 * made for each other in reality, so filling is the honest composite.
 */
function DoorLayer({ leaf, paint, paintKey, geom, lightTint, fade }: { leaf: Leaf; paint: Tint | null; paintKey: string; geom: { ox: number; oy: number; ow: number; oh: number }; lightTint: string; fade: boolean }) {
  const { ox, oy, ow, oh } = geom;
  const [op, setOp] = useState(fade ? 0 : 1);
  useEffect(() => {
    const r = requestAnimationFrame(() => setOp(1));
    return () => cancelAnimationFrame(r);
  }, []);

  // The photographed door while the recolour renders — a frame of white is
  // quieter than a frame of nothing.
  const url = useRender(() => (paint ? recolorLeaf(leaf, paint) : Promise.resolve(leaf.image)), leaf.image, [leaf, paintKey]);

  const handle =
    leaf.handleSwappable && leaf.handleAt
      ? (() => {
          const hw = HANDLE_PLACE.wFrac * ow;
          const hh = HANDLE_PLACE.hFrac * oh;
          const mirror = leaf.handleSide === 'right';
          return {
            left: leaf.handleAt.x * ow - (mirror ? 1 - HANDLE_PLACE.cx : HANDLE_PLACE.cx) * hw,
            top: leaf.handleAt.y * oh - HANDLE_PLACE.cy * hh,
            width: hw,
            height: hh,
            transform: mirror ? 'scaleX(-1)' : undefined,
          };
        })()
      : null;

  return (
    <div style={{ position: 'absolute', left: ox, top: oy, width: ow, height: oh, opacity: op, transition: `opacity 340ms ${EASE}`, willChange: 'opacity' }}>
      <img src={url} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'fill', display: 'block' }} />
      <div style={{ position: 'absolute', inset: 0, background: lightTint, mixBlendMode: 'multiply', pointerEvents: 'none' }} />
      {handle && <img src={HANDLE_IMAGE} alt="" draggable={false} style={{ position: 'absolute', ...handle, transformOrigin: 'center', pointerEvents: 'none' }} />}
    </div>
  );
}
