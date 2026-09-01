import { useCallback, useEffect, useRef, useState } from 'react';
import { COLOR, RADIUS, RADIUS_SM, TOUCH_MIN, TYPE } from '../design/tokens';
import { processRoom, type Rect } from './roomProcess';
import { saveRoom, type AdminRoom, type TrimRole } from './adminStore';
import { Panel, Label, inp, primaryBtn, ghostBtn, linkBtn, Handle, DimHUD } from './DoorBench';
import { recolorTrim } from '../render/recolor';
import type { Tint } from '../catalog/colors';
import type { Room } from '../catalog/types';

function compactSource(el: HTMLImageElement, maxW = 1300): string {
  const scale = Math.min(1, maxW / el.width);
  const c = document.createElement('canvas');
  c.width = Math.round(el.width * scale);
  c.height = Math.round(el.height * scale);
  c.getContext('2d')!.drawImage(el, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

/** A strong, fixed reference tint for the trim preview — not the neutral
 *  default, so a missing or misplaced box is glaring rather than a subtle
 *  shade of white-on-white. */
const PREVIEW_TINT: Tint = [0.22, 0.32, 0.62];

const ROLE_ORDER: TrimRole[] = ['shaft', 'crown', 'footL', 'footR'];
/** Muted, editorial tones — not neon — so the box outlines and their row
 *  swatches sit comfortably in the same warm, printed-catalogue palette as
 *  the rest of the bench, while staying five clearly distinct hues. */
const ROLE_META: Record<TrimRole, { label: string; color: string }> = {
  shaft: { label: 'Yelka', color: '#C0952E' },
  crown: { label: 'Korona', color: '#A83D6B' },
  footL: { label: 'Chap oyoq', color: '#1E8FA0' },
  footR: { label: 'O‘ng oyoq', color: '#4C8C4A' },
  extra: { label: 'Boshqa', color: '#B85A2E' },
};

interface Point { x: number; y: number }

interface TrimBox {
  id: string;
  role: TrimRole;
  label?: string;
  /** The piece's bounding box — kept in sync as the bbox of `points`.
   *  recolorTrim's shared-crop and the HUD both read this regardless of the
   *  actual outline. */
  rect: Rect;
  /**
   * The piece's real outline, wound clockwise from top-left, image
   * fractions. Always at least 4 points and always independently draggable
   * — a moulded crown is rarely a clean box, so trim was never really a
   * rectangle to begin with; it only looked like one because it started as
   * 4 points at a rectangle's corners. Dragging one point moves ONLY that
   * point.
   */
  points: Point[];
}

/** The smallest rect containing every point — `points`' bounding box. */
function bboxOfPoints(points: Point[]): Rect {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
}

/** A rect's four corners as a closed polygon, tl→tr→br→bl — the winding a
 *  simple (non-self-crossing) outline needs. Seeds a fresh 'poly' shape from
 *  whatever rect the piece already had, so switching never starts blank. */
function seedPoints(rect: Rect): Point[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h },
  ];
}

/** Perpendicular distance from p to the segment a–b (clamped to the segment). */
function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Where a new point belongs: on the edge it lands closest to, so a click
 * anywhere near the outline inserts right there rather than tacking a point
 * onto the end and scrambling the shape. With fewer than two points yet,
 * there is no edge to measure — just append.
 */
function insertIndexForPoint(points: Point[], p: Point): number {
  if (points.length < 2) return points.length;
  let bestI = points.length, bestD = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = distToSegment(p, points[i], points[(i + 1) % points.length]);
    if (d < bestD) { bestD = d; bestI = i + 1; }
  }
  return bestI;
}

type Corner = 'tl' | 'tr' | 'bl' | 'br';

/**
 * Where a corner lands after a drag, clamped so the box never inverts or
 * vanishes. Shared by the doorway box and every trim box — one rule for
 * "drag a corner", not one copy per box that happens to need it.
 *
 * All four corners are independently grabbable, matching the door bench's
 * four dots: dragging one keeps the DIAGONALLY OPPOSITE corner anchored,
 * which is the one rule that makes all four consistent — 'tl'/'br' were
 * already exactly this (anchored on the other), 'tr'/'bl' just anchor on
 * their own opposite instead of being unreachable.
 */
function resizeCorner(rect: Rect, corner: Corner, p: { x: number; y: number }, min = 0.05): Rect {
  const right = rect.x + rect.w;
  const bottom = rect.y + rect.h;
  const cx = Math.min(Math.max(0, p.x), 1);
  const cy = Math.min(Math.max(0, p.y), 1);
  switch (corner) {
    case 'tl': {
      const nx = Math.min(cx, right - min);
      const ny = Math.min(cy, bottom - min);
      return { x: nx, y: ny, w: right - nx, h: bottom - ny };
    }
    case 'br': {
      const nr = Math.max(rect.x + min, cx);
      const nb = Math.max(rect.y + min, cy);
      return { ...rect, w: nr - rect.x, h: nb - rect.y };
    }
    case 'tr': {
      const nr = Math.max(rect.x + min, cx);
      const ny = Math.min(cy, bottom - min);
      return { x: rect.x, y: ny, w: nr - rect.x, h: bottom - ny };
    }
    case 'bl': {
      const nx = Math.min(cx, right - min);
      const nb = Math.max(rect.y + min, cy);
      return { x: nx, y: rect.y, w: right - nx, h: nb - rect.y };
    }
  }
}

/** The four corners of a rect, as fractions, paired with which one they are —
 *  what every four-handle box (the doorway, and each trim box) draws from. */
function corners(rect: Rect): { corner: Corner; x: number; y: number }[] {
  return [
    { corner: 'tl', x: rect.x, y: rect.y },
    { corner: 'tr', x: rect.x + rect.w, y: rect.y },
    { corner: 'bl', x: rect.x, y: rect.y + rect.h },
    { corner: 'br', x: rect.x + rect.w, y: rect.y + rect.h },
  ];
}

/** A reasonable starting rectangle for a role, so a chip click drops a box
 *  roughly where it belongs instead of a blank square to drag from scratch —
 *  the same shortcut hand-measuring these against real photos leaned on. */
function defaultRectFor(role: TrimRole, open: Rect, trim: TrimBox[]): Rect {
  const shaft = trim.find((t) => t.role === 'shaft')?.rect ?? open;
  switch (role) {
    case 'shaft':
      return { x: Math.max(0, open.x - 0.03), y: Math.max(0, open.y - 0.03), w: Math.min(1 - open.x + 0.03, open.w + 0.06), h: Math.min(1 - open.y + 0.03, open.h + 0.035) };
    case 'crown':
      return { x: shaft.x, y: Math.max(0, shaft.y - 0.05), w: shaft.w, h: 0.045 };
    case 'footL':
      return { x: Math.max(0, shaft.x - 0.015), y: Math.min(0.94, shaft.y + shaft.h - 0.05), w: 0.06, h: 0.05 };
    case 'footR':
      return { x: Math.min(0.94 - 0.06, shaft.x + shaft.w - 0.045), y: Math.min(0.94, shaft.y + shaft.h - 0.05), w: 0.06, h: 0.05 };
    case 'extra':
      return { x: 0.4, y: 0.4, w: 0.15, h: 0.1 };
  }
}

/**
 * A guess at which box is which, for a built-in room being opened at the
 * bench for the first time — it shipped with `trimBoxes` (hand-measured, see
 * tools/rooms.mjs) but no `trimRoles` (that field only exists for the bench).
 * Purely a starting label for editing; once republished, trimRoles is real
 * and this never runs again for that room.
 */
type StoredTrim = Rect & { points?: Point[] };

/** What a piece publishes: its bbox, plus its real outline. */
function toStoredBox(t: TrimBox): StoredTrim {
  return { ...t.rect, points: t.points };
}

/** Build a bench TrimBox from whatever a room stored. Older data (saved
 *  before free points existed) has no `points` — seeded from its rect, same
 *  as a brand-new piece, so it opens as 4 draggable corners rather than
 *  erroring. */
function toTrimBox(id: string, role: TrimRole, label: string | undefined, box: StoredTrim): TrimBox {
  const rect = { x: box.x, y: box.y, w: box.w, h: box.h };
  return { id, role, label, rect, points: box.points && box.points.length >= 3 ? box.points : seedPoints(rect) };
}

function inferRoles(boxes: StoredTrim[]): TrimBox[] {
  if (boxes.length === 0) return [];
  const byArea = [...boxes].sort((a, b) => b.w * b.h - a.w * a.h);
  const shaft = byArea[0];
  const rest = boxes.filter((b) => b !== shaft);
  const crown = rest.find((b) => b.y + b.h <= shaft.y + 0.01);
  const feet = rest.filter((b) => b !== crown).sort((a, b) => a.x - b.x);
  const out: TrimBox[] = [toTrimBox('shaft', 'shaft', undefined, shaft)];
  if (crown) out.push(toTrimBox('crown', 'crown', undefined, crown));
  if (feet[0]) out.push(toTrimBox('footL', 'footL', undefined, feet[0]));
  if (feet[1]) out.push(toTrimBox('footR', 'footR', undefined, feet[1]));
  feet.slice(2).forEach((box, i) => out.push(toTrimBox(`extra-${i}`, 'extra', undefined, box)));
  return out;
}

/**
 * Add a room: upload an interior photograph, drag a box over the DOORWAY, and
 * publish it. The doorway is replaced with an unlit recess so a door dropped in
 * covers dark, not another door's bright edge, and the room's own light is read
 * off the wall so a neutral-white leaf can be relit to belong. Marking the box
 * by hand is the reliable path — a doorway on a photograph is not something a
 * machine can be trusted to find, and four drags cost nothing.
 *
 * A rectangle, not four free corners: a doorway photographed straight-on is
 * upright, and the two corners the user drags (top-left, bottom-right) are
 * enough. Nudge arrows take it to the pixel.
 *
 * Below the doorway, the nalichnik: however many pieces of trim the photo's
 * architrave actually has (a shaft ring is the common case; a crown and one
 * or two flared feet are added only where the photo shows them), each its own
 * box, all painted the door's colour together by recolorTrim() — the same
 * function the showroom itself calls, so this bench's preview and the
 * customer's screen can never disagree.
 */
export function RoomBench({ onDone, edit }: { onDone: () => void; edit?: AdminRoom }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [box, setBox] = useState<Rect | null>(null); // fractions
  const [trim, setTrim] = useState<TrimBox[]>([]);
  const [activeTrimId, setActiveTrimId] = useState<string | null>(null);
  const [showTint, setShowTint] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [result, setResult] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  /** The doorway drags as a true rectangle (a real opening is one); a trim
   *  piece drags one point of its outline at a time, by index. */
  const drag = useRef<{ kind: 'corner'; corner: Corner } | { kind: 'point'; trimId: string; index: number } | null>(null);

  useEffect(() => {
    if (!edit) return;
    setName(edit.name.uz);
    if (edit.trimBoxes) {
      setTrim(edit.trimRoles && edit.trimRoles.length === edit.trimBoxes.length
        ? edit.trimRoles.map((r, i) => toTrimBox(`${r.role}-${i}`, r.role, r.label, edit.trimBoxes![i]))
        : inferRoles(edit.trimBoxes));
    }
    if (!edit.source) return;
    const el = new Image();
    el.onload = () => {
      setImg(el);
      setSource(edit.source!);
      setZoom(Math.min(1, (window.innerHeight - 150) / el.height));
      setBox(edit.box ?? edit.open);
    };
    el.src = edit.source;
  }, [edit]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const el = new Image();
    el.onload = () => {
      setImg(el);
      setSource(compactSource(el));
      setZoom(Math.min(1, (window.innerHeight - 150) / el.height));
      setBox({ x: 0.34, y: 0.18, w: 0.32, h: 0.66 });
      setTrim([]);
      setActiveTrimId(null);
      setResult(null);
      if (!name) setName(f.name.replace(/\.[^.]+$/, ''));
    };
    el.src = URL.createObjectURL(f);
  };

  const toFrac = useCallback(
    (cx: number, cy: number) => {
      const r = wrapRef.current!.getBoundingClientRect();
      return { x: (cx - r.left) / r.width, y: (cy - r.top) / r.height };
    },
    []
  );
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const p = toFrac(e.clientX, e.clientY);
    const d = drag.current;
    if (d.kind === 'corner') {
      setBox((b) => (b ? resizeCorner(b, d.corner, p) : b));
    } else {
      const { trimId, index } = d;
      const cx = Math.min(Math.max(0, p.x), 1), cy = Math.min(Math.max(0, p.y), 1);
      setTrim((ts) => ts.map((t) => {
        if (t.id !== trimId) return t;
        // ONLY this one point moves — every other point of the outline stays
        // exactly where it was, which is the entire point of a free polygon
        // over a rectangle's coupled opposite-corner behaviour.
        const points = t.points.map((pt, i) => (i === index ? { x: cx, y: cy } : pt));
        return { ...t, points, rect: bboxOfPoints(points) };
      }));
    }
  };
  const nudgeOpen = (dx: number, dy: number, kind: 'move' | 'size') => {
    if (!img) return;
    const fx = dx / img.width, fy = dy / img.height;
    setBox((b) => (b ? (kind === 'move' ? { ...b, x: b.x + fx, y: b.y + fy } : { ...b, w: b.w + fx, h: b.h + fy }) : b));
  };
  /** A trim piece only ever nudges by MOVING — translating every point
   *  together. There is no single "size" for a free outline. */
  const nudgeTrim = (trimId: string, dx: number, dy: number) => {
    if (!img) return;
    const fx = dx / img.width, fy = dy / img.height;
    setTrim((ts) => ts.map((t) => {
      if (t.id !== trimId) return t;
      const points = t.points.map((p) => ({ x: p.x + fx, y: p.y + fy }));
      return { ...t, points, rect: bboxOfPoints(points) };
    }));
  };

  const addTrim = (role: TrimRole) => {
    if (!box) return;
    const id = role === 'extra' ? `extra-${Date.now().toString(36)}` : role;
    const rect = defaultRectFor(role, box, trim);
    const label = role === 'extra' ? `Boshqa ${trim.filter((t) => t.role === 'extra').length + 1}` : undefined;
    setTrim((ts) => [...ts, { id, role, label, rect, points: seedPoints(rect) }]);
    setActiveTrimId(id);
  };
  const removeTrim = (id: string) => {
    setTrim((ts) => ts.filter((t) => t.id !== id));
    setActiveTrimId((a) => (a === id ? null : a));
  };
  const removePoint = (trimId: string, index: number) => {
    setTrim((ts) => ts.map((t) => {
      if (t.id !== trimId || t.points.length <= 3) return t;
      const points = t.points.filter((_, i) => i !== index);
      return { ...t, points, rect: bboxOfPoints(points) };
    }));
  };
  /** Click near the outline (not on an existing handle) inserts a new point
   *  on the nearest edge and starts dragging it — the same "click the line to
   *  add an anchor" gesture a vector-path tool uses. One click is enough;
   *  it does not wait for a second. */
  const onAddPoint = (e: React.PointerEvent) => {
    if (drag.current) return; // a handle's own onPointerDown already claimed this gesture
    const active = trim.find((t) => t.id === activeTrimId);
    if (!active) return;
    const p = toFrac(e.clientX, e.clientY);
    const cx = Math.min(Math.max(0, p.x), 1), cy = Math.min(Math.max(0, p.y), 1);
    const idx = insertIndexForPoint(active.points, { x: cx, y: cy });
    setTrim((ts) => ts.map((t) => {
      if (t.id !== active.id) return t;
      const points = [...t.points.slice(0, idx), { x: cx, y: cy }, ...t.points.slice(idx)];
      return { ...t, points, rect: bboxOfPoints(points) };
    }));
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { kind: 'point', trimId: active.id, index: idx };
  };

  // Live trim preview — the exact function the showroom uses, on a draft room
  // built from what's on screen right now, debounced like DoorBench's own
  // live rectify preview so every drag frame doesn't demand a fresh derive.
  const [trimPreview, setTrimPreview] = useState<string | null>(null);
  useEffect(() => {
    const src = source ?? edit?.source;
    if (!img || !box || !src || trim.length === 0) { setTrimPreview(null); return; }
    const draftRoom: Room = {
      id: 'draft', name: { uz: '', kk: '', ru: '' },
      image: src, thumb: src,
      aspect: img.width / img.height,
      open: box,
      trimBoxes: trim.map(toStoredBox),
      light: [1, 1, 1],
    };
    const t = window.setTimeout(() => {
      recolorTrim(draftRoom, PREVIEW_TINT).then(setTrimPreview);
    }, 150);
    return () => window.clearTimeout(t);
  }, [img, box, trim, source, edit]);

  const preview = () => {
    if (!img || !box) return;
    setResult(processRoom(img, box).image);
  };
  const publish = () => {
    if (!img || !box) return;
    const p = processRoom(img, box);
    // The chooser thumbnail is the room untouched (door and all); the compact
    // source doubles as it, so no black recess shows on the selection screen.
    const thumb = source ?? edit?.source ?? p.image;
    saveRoom({
      id: edit?.id ?? 'a-' + Date.now().toString(36),
      name: { uz: name || 'Xona', kk: name || 'Bólme', ru: name || 'Комната' },
      image: p.image,
      thumb,
      aspect: p.aspect,
      open: box,
      trimBoxes: trim.length ? trim.map(toStoredBox) : undefined,
      trimRoles: trim.length ? trim.map((t) => ({ role: t.role, label: t.label })) : undefined,
      light: p.light,
      createdAt: edit?.createdAt ?? Date.now(),
      source: source ?? edit?.source,
      box,
    });
    onDone();
  };

  const dispW = img ? img.width * zoom : 0;
  const dispH = img ? img.height * zoom : 0;
  const activeTrim = trim.find((t) => t.id === activeTrimId) ?? null;
  const dc = drag.current;
  const draggingRect = dc?.kind === 'corner' ? box : activeTrim?.rect ?? null;

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%' }}>
      <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: COLOR.studio }}>
        {!img && (
          <label style={{ margin: 'auto', textAlign: 'center', cursor: 'pointer', border: `1.5px dashed ${COLOR.lineStrong}`, borderRadius: RADIUS, padding: '64px 80px', background: '#fff' }}>
            <div style={{ ...TYPE.h2, color: COLOR.ink, marginBottom: 8 }}>Xona rasmini yuklang</div>
            <div style={{ ...TYPE.small, color: COLOR.inkSoft }}>Eshik o‘rnini (teshikni) o‘zingiz belgilaysiz</div>
            <input type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
          </label>
        )}
        {img && box && (
          <div
            ref={wrapRef}
            style={{ position: 'relative', width: dispW, height: dispH, flexShrink: 0, touchAction: 'none' }}
            onPointerMove={onMove}
            onPointerUp={() => (drag.current = null)}
            onPointerDown={onAddPoint}
          >
            <img src={img.src} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none' }} />
            {showTint && trimPreview && (
              <img src={trimPreview} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
            )}

            {/* Only the box actually being worked on is ever drawn — the doorway
                while no trim is active, or exactly one trim box while it is.
                Everything else stays out of the way instead of cluttering the
                photo with every measurement at once; the row list (or toggling
                a trim row off) is how focus moves between them. */}
            {!activeTrim && (
              <>
                <div style={{ position: 'absolute', left: box.x * dispW, top: box.y * dispH, width: box.w * dispW, height: box.h * dispH, border: `1.5px solid ${COLOR.brass}`, background: 'rgba(35,32,27,.35)' }} />
                {corners(box).map(({ corner, x, y }) => (
                  <Handle key={corner} x={x * dispW} y={y * dispH} onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture(e.pointerId); drag.current = { kind: 'corner', corner }; }} />
                ))}
              </>
            )}
            {activeTrim && (
              <>
                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                  <polygon
                    points={activeTrim.points.map((p) => `${p.x * dispW},${p.y * dispH}`).join(' ')}
                    fill="rgba(35,32,27,.15)"
                    stroke={ROLE_META[activeTrim.role].color}
                    strokeWidth={2}
                  />
                </svg>
                {activeTrim.points.map((p, i) => (
                  <Handle
                    key={i}
                    x={p.x * dispW}
                    y={p.y * dispH}
                    color={ROLE_META[activeTrim.role].color}
                    onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture(e.pointerId); drag.current = { kind: 'point', trimId: activeTrim.id, index: i }; }}
                    onDoubleClick={() => removePoint(activeTrim.id, i)}
                  />
                ))}
              </>
            )}

            {draggingRect && <DimHUD rect={draggingRect} w={img.width} h={img.height} />}
          </div>
        )}
      </div>

      <Panel>
        <button onClick={onDone} style={linkBtn}>← Ro‘yxatga qaytish</button>
        <div style={{ ...TYPE.h2, color: COLOR.ink, margin: '10px 0 4px' }}>{edit ? 'Xonani tahrirlash' : 'Yangi xona'}</div>
        <div style={{ ...TYPE.small, color: COLOR.inkSoft, marginBottom: 18 }}>
          Eshik turadigan <b>teshikni</b> to‘rtburchak bilan belgilang (u qorong‘i
          o‘yiqqa aylanadi), so‘ng pastda <b>nalichnikning</b> ranglanadigan
          qismlarini belgilang.
        </div>
        {img && box && (
          <>
            <Label>Nomi</Label>
            <input value={name} onChange={(e) => setName(e.target.value)} style={inp} placeholder="Masalan: Yorug‘ zal" />
            <Label>Kattalashtirish — {(zoom * 100).toFixed(0)}%</Label>
            <input type="range" min={0.08} max={2} step={0.02} value={zoom} onChange={(e) => setZoom(+e.target.value)} style={{ width: '100%' }} />
            <Label>Teshikni surish</Label>
            <MoveResize onMove={(dx, dy) => nudgeOpen(dx, dy, 'move')} onSize={(dx, dy) => nudgeOpen(dx, dy, 'size')} />

            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 22 }}>
              <Label>Nalichnik qismlari</Label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: COLOR.inkSoft, cursor: 'pointer' }}>
                <input type="checkbox" checked={showTint} onChange={(e) => setShowTint(e.target.checked)} />
                Ranglab ko‘rsatish
              </label>
            </div>
            <div style={{ fontSize: 12, color: COLOR.inkSoft, lineHeight: 1.5, marginBottom: 10 }}>
              Bo‘yoq shu qismlarga tushadi. {trim.length === 0 && <span style={{ color: '#A6432C' }}>Bo‘sh qoldirilsa, nalichnik oq bo‘lib qoladi.</span>}
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ROLE_ORDER.map((role) => {
                const present = trim.some((t) => t.role === role);
                return (
                  <RoleChip key={role} label={ROLE_META[role].label} color={ROLE_META[role].color} disabled={present} onClick={() => addTrim(role)} />
                );
              })}
              <RoleChip label="Boshqa" color={ROLE_META.extra.color} onClick={() => addTrim('extra')} />
            </div>

            <div style={{ marginTop: 10 }}>
              {trim.map((t) => {
                const meta = ROLE_META[t.role];
                const active = t.id === activeTrimId;
                return (
                  <div key={t.id} style={{ marginTop: 6 }}>
                    <div
                      onClick={() => setActiveTrimId(active ? null : t.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: TOUCH_MIN, padding: '7px 9px', borderRadius: RADIUS_SM, background: active ? 'rgba(143,113,69,.08)' : COLOR.paper, border: `1px solid ${active ? meta.color : COLOR.line}`, cursor: 'pointer' }}
                    >
                      <span style={{ width: 11, height: 11, borderRadius: 999, background: meta.color, flex: '0 0 auto' }} />
                      {t.role === 'extra' ? (
                        <input
                          value={t.label ?? ''}
                          onChange={(e) => setTrim((ts) => ts.map((x) => (x.id === t.id ? { ...x, label: e.target.value } : x)))}
                          onClick={(e) => e.stopPropagation()}
                          style={{ flex: 1, background: 'transparent', border: 'none', color: COLOR.ink, fontSize: 13, fontFamily: 'inherit', padding: 0 }}
                        />
                      ) : (
                        <span style={{ flex: 1, fontSize: 13, color: COLOR.ink }}>{meta.label}</span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeTrim(t.id); }}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, flex: '0 0 auto', background: 'none', border: 'none', color: '#A6432C', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}
                        aria-label="O‘chirish"
                      >
                        ✕
                      </button>
                    </div>
                    {active && (
                      <div style={{ marginTop: 8, paddingLeft: 4 }}>
                        <div style={{ fontSize: 11, color: COLOR.inkSoft, lineHeight: 1.5 }}>
                          Har bir nuqta <b>mustaqil</b> — bittasini tortsangiz, faqat o‘sha
                          siljiydi. Chiziq bo‘ylab <b>bir marta bosib</b> yangi nuqta qo‘shing.
                          Nuqtani <b>ikki marta bosish</b> uni o‘chiradi (kamida 3 ta nuqta qolishi kerak).
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <MoveResize onMove={(dx, dy) => nudgeTrim(t.id, dx, dy)} onSize={() => {}} sizeless />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button onClick={preview} style={ghostBtn}>Ko‘rish</button>
            {result && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'center', background: COLOR.paper, border: `1px solid ${COLOR.line}`, borderRadius: RADIUS, padding: 10 }}>
                  <img src={result} alt="" style={{ maxHeight: 300, borderRadius: RADIUS_SM }} />
                </div>
                <button onClick={publish} style={primaryBtn}>Katalogga qo‘shish ✓</button>
              </div>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}

function RoleChip({ label, color, disabled, onClick }: { label: string; color: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 7, minHeight: TOUCH_MIN, padding: '7px 14px', borderRadius: 999, fontFamily: 'inherit',
        border: `1px solid ${disabled ? COLOR.line : color}`, background: 'transparent',
        color: disabled ? COLOR.inkSoft : COLOR.ink, fontSize: 13, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color }} />
      + {label}
    </button>
  );
}

function MoveResize({ onMove, onSize, sizeless }: { onMove: (dx: number, dy: number) => void; onSize: (dx: number, dy: number) => void; sizeless?: boolean }) {
  const cell = (t: string, fn: () => void) => (
    <button onClick={fn} style={{ background: '#fff', border: `1px solid ${COLOR.lineStrong}`, borderRadius: RADIUS_SM, color: COLOR.ink, cursor: 'pointer', fontSize: 13, minHeight: 40, padding: 0 }}>{t}</button>
  );
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, color: COLOR.inkSoft, marginBottom: 4 }}>O‘rni</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 3 }}>
          <span />{cell('▲', () => onMove(0, -8))}<span />
          {cell('◀', () => onMove(-8, 0))}<span />{cell('▶', () => onMove(8, 0))}
          <span />{cell('▼', () => onMove(0, 8))}<span />
        </div>
      </div>
      {!sizeless && (
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, color: COLOR.inkSoft, marginBottom: 4 }}>O‘lchami</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
            {cell('En −', () => onSize(-8, 0))}{cell('En +', () => onSize(8, 0))}
            {cell('Bo‘y −', () => onSize(0, -8))}{cell('Bo‘y +', () => onSize(0, 8))}
          </div>
        </div>
      )}
    </div>
  );
}
