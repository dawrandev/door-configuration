import { useCallback, useEffect, useRef, useState } from 'react';
import { COLOR, RADIUS, RADIUS_SM, TOUCH_MIN, TYPE } from '../design/tokens';
import { processRoom, type Rect } from './roomProcess';
import { saveRoom, type AdminRoom } from './adminStore';
import { Panel, PanelBody, PanelFooter, Label, Section, inp, AdminPrimaryButton, Handle, DimHUD, DANGER, useToast, ROLE_ORDER, ROLE_META, RoleChip, MoveResize } from './adminKit';
import { bboxOfPoints, seedPoints, defaultRectFor, nearestLoop, toStoredTrim, toTrimState, type Point, type TrimPieceState } from './trimGeometry';
import { recolorTrim } from '../render/recolor';
import type { Tint } from '../catalog/colors';
import type { Room, TrimPiece, TrimRole } from '../catalog/types';

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

/**
 * A guess at which box is which, for a room whose trim pieces carry no role
 * at all yet (neither on the box nor in the older parallel array) — shipped
 * `trimBoxes` (hand-measured, see tools/rooms.mjs) predates roles entirely.
 * Purely a starting label for editing; once republished, every piece has a
 * real role on it and this never runs again for that room.
 */
function inferRoles(boxes: TrimPiece[]): TrimPieceState[] {
  if (boxes.length === 0) return [];
  const byArea = [...boxes].sort((a, b) => b.w * b.h - a.w * a.h);
  const shaft = byArea[0];
  const rest = boxes.filter((b) => b !== shaft);
  const crown = rest.find((b) => b.y + b.h <= shaft.y + 0.01);
  const feet = rest.filter((b) => b !== crown).sort((a, b) => a.x - b.x);
  const out: TrimPieceState[] = [toTrimState('shaft', shaft, 'shaft')];
  if (crown) out.push(toTrimState('crown', crown, 'crown'));
  if (feet[0]) out.push(toTrimState('footL', feet[0], 'footL'));
  if (feet[1]) out.push(toTrimState('footR', feet[1], 'footR'));
  feet.slice(2).forEach((box, i) => out.push(toTrimState(`extra-${i}`, box, 'extra')));
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
  const [trim, setTrim] = useState<TrimPieceState[]>([]);
  const [activeTrimId, setActiveTrimId] = useState<string | null>(null);
  const [showTint, setShowTint] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const wrapRef = useRef<HTMLDivElement>(null);
  /** The doorway drags as a true rectangle (a real opening is one); a trim
   *  piece drags one point of its outer OR inner (hole) outline at a time,
   *  by index — `loop` says which. */
  const drag = useRef<{ kind: 'corner'; corner: Corner } | { kind: 'point'; trimId: string; loop: 'points' | 'holePoints'; index: number } | null>(null);

  useEffect(() => {
    if (!edit) return;
    setName(edit.name.uz);
    if (edit.trimBoxes) {
      const boxes = edit.trimBoxes;
      setTrim(
        boxes.every((b) => b.role)
          ? boxes.map((b, i) => toTrimState(`${b.role}-${i}`, b))
          : edit.legacyTrimRoles && edit.legacyTrimRoles.length === boxes.length
            ? edit.legacyTrimRoles.map((r, i) => toTrimState(`${r.role}-${i}`, boxes[i], r.role, r.label))
            : inferRoles(boxes)
      );
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
      const { trimId, loop, index } = d;
      const cx = Math.min(Math.max(0, p.x), 1), cy = Math.min(Math.max(0, p.y), 1);
      setTrim((ts) => ts.map((t) => {
        if (t.id !== trimId) return t;
        // ONLY this one point moves — every other point of the outline stays
        // exactly where it was, which is the entire point of a free polygon
        // over a rectangle's coupled opposite-corner behaviour.
        const source = t[loop] ?? [];
        const updated = source.map((pt, i) => (i === index ? { x: cx, y: cy } : pt));
        return loop === 'points' ? { ...t, points: updated, rect: bboxOfPoints(updated) } : { ...t, holePoints: updated };
      }));
    }
  };
  const nudgeOpen = (dx: number, dy: number, kind: 'move' | 'size') => {
    if (!img) return;
    const fx = dx / img.width, fy = dy / img.height;
    setBox((b) => (b ? (kind === 'move' ? { ...b, x: b.x + fx, y: b.y + fy } : { ...b, w: b.w + fx, h: b.h + fy }) : b));
  };
  /** A trim piece only ever nudges by MOVING — translating every point
   *  together, outer edge and inner hole alike (nudging repositions the
   *  whole piece, it doesn't reshape it). There is no single "size" for a
   *  free outline. */
  const nudgeTrim = (trimId: string, dx: number, dy: number) => {
    if (!img) return;
    const fx = dx / img.width, fy = dy / img.height;
    const shift = (pts: Point[]) => pts.map((p) => ({ x: p.x + fx, y: p.y + fy }));
    setTrim((ts) => ts.map((t) => {
      if (t.id !== trimId) return t;
      const points = shift(t.points);
      return { ...t, points, rect: bboxOfPoints(points), holePoints: t.holePoints && shift(t.holePoints) };
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
  /** The inner (hole) edge is opt-in per piece, off by default — most
   *  pieces (a crown, a foot block) are solid and have no inner edge to
   *  trace. Turning it on seeds a starting quad from the doorway box, same
   *  as a fresh outer edge starts from a rough rect; turning it off drops
   *  the trace entirely rather than remembering it, so it stays a clean
   *  yes/no rather than a hidden, possibly-stale shape. */
  const toggleHole = (trimId: string) => {
    if (!box) return;
    setTrim((ts) => ts.map((t) => (t.id === trimId ? { ...t, holePoints: t.holePoints ? undefined : seedPoints(box) } : t)));
  };
  const removePoint = (trimId: string, loop: 'points' | 'holePoints', index: number) => {
    setTrim((ts) => ts.map((t) => {
      const source = t[loop];
      if (t.id !== trimId || !source || source.length <= 3) return t;
      const updated = source.filter((_, i) => i !== index);
      return loop === 'points' ? { ...t, points: updated, rect: bboxOfPoints(updated) } : { ...t, holePoints: updated };
    }));
  };
  /** Click near an outline (not on an existing handle) inserts a new point
   *  on the nearest edge and starts dragging it — the same "click the line
   *  to add an anchor" gesture a vector-path tool uses. One click is
   *  enough; it does not wait for a second. When a piece has both an outer
   *  edge and an inner hole on screen, the click goes to whichever edge it
   *  actually landed closest to. */
  const onAddPoint = (e: React.PointerEvent) => {
    if (drag.current) return; // a handle's own onPointerDown already claimed this gesture
    const active = trim.find((t) => t.id === activeTrimId);
    if (!active) return;
    const p = toFrac(e.clientX, e.clientY);
    const cx = Math.min(Math.max(0, p.x), 1), cy = Math.min(Math.max(0, p.y), 1);
    const { loop, index: idx } = nearestLoop(active, { x: cx, y: cy });
    setTrim((ts) => ts.map((t) => {
      if (t.id !== active.id) return t;
      const source = t[loop] ?? [];
      const updated = [...source.slice(0, idx), { x: cx, y: cy }, ...source.slice(idx)];
      return loop === 'points' ? { ...t, points: updated, rect: bboxOfPoints(updated) } : { ...t, holePoints: updated };
    }));
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { kind: 'point', trimId: active.id, loop, index: idx };
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
      trimBoxes: trim.map(toStoredTrim),
      light: [1, 1, 1],
    };
    let live = true;
    const t = window.setTimeout(() => {
      // A drag issues a new derive on every debounce tick; nothing stops an
      // earlier tick's promise from resolving after a later one's. Without
      // this guard the older result can land last and overwrite the current
      // drag position with a stale outline.
      recolorTrim(draftRoom, PREVIEW_TINT).then((url) => { if (live) setTrimPreview(url); });
    }, 150);
    return () => { live = false; window.clearTimeout(t); };
  }, [img, box, trim, source, edit]);

  /**
   * A live look at what publish() will actually save — the doorway recess
   * painted in and the wall's ambient light sampled, both computed by
   * processRoom() exactly as publish() calls it. Publish used to be gated
   * behind a manual "Ko'rish" step that ran this same function; that gate is
   * gone (redundant once the doorway box already renders live on the photo
   * while it's being dragged), but the recess/light result itself was never
   * visible before saving without it. This closes that gap without bringing
   * the extra tap back.
   */
  const [finalPreview, setFinalPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!img || !box) { setFinalPreview(null); return; }
    let live = true;
    const t = window.setTimeout(() => {
      const p = processRoom(img, box);
      if (live) setFinalPreview(p.image);
    }, 200);
    return () => { live = false; window.clearTimeout(t); };
  }, [img, box]);

  const publish = () => {
    if (!img || !box) return;
    setBusy(true);
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
      // Each piece's role now travels on the box itself (toStoredTrim) — the
      // old parallel trimRoles array is a read-only fallback for older data,
      // never written by a fresh publish.
      trimBoxes: trim.length ? trim.map(toStoredTrim) : undefined,
      light: p.light,
      createdAt: edit?.createdAt ?? Date.now(),
      source: source ?? edit?.source,
      box,
    });
    setBusy(false);
    toast('Saqlandi ✓');
    onDone();
  };

  const dispW = img ? img.width * zoom : 0;
  const dispH = img ? img.height * zoom : 0;
  const activeTrim = trim.find((t) => t.id === activeTrimId) ?? null;
  const dc = drag.current;
  const draggingRect = dc?.kind === 'corner' ? box : activeTrim?.rect ?? null;

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', minHeight: 0 }}>
      <div className="scr" style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: COLOR.studio }}>
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
                  {/* The inner (hole) edge — dashed, so it reads as "cut out of"
                      the solid outer edge rather than a second identical piece. */}
                  {activeTrim.holePoints && (
                    <polygon
                      points={activeTrim.holePoints.map((p) => `${p.x * dispW},${p.y * dispH}`).join(' ')}
                      fill="rgba(255,255,255,.28)"
                      stroke={ROLE_META[activeTrim.role].color}
                      strokeWidth={2}
                      strokeDasharray="6 5"
                    />
                  )}
                </svg>
                {activeTrim.points.map((p, i) => (
                  <Handle
                    key={`o${i}`}
                    x={p.x * dispW}
                    y={p.y * dispH}
                    color={ROLE_META[activeTrim.role].color}
                    onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture(e.pointerId); drag.current = { kind: 'point', trimId: activeTrim.id, loop: 'points', index: i }; }}
                    onDoubleClick={() => removePoint(activeTrim.id, 'points', i)}
                  />
                ))}
                {/* Same colour as the outer handles — the dashed connecting
                    lines already say which loop a point belongs to. */}
                {activeTrim.holePoints?.map((p, i) => (
                  <Handle
                    key={`h${i}`}
                    x={p.x * dispW}
                    y={p.y * dispH}
                    color={ROLE_META[activeTrim.role].color}
                    onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture(e.pointerId); drag.current = { kind: 'point', trimId: activeTrim.id, loop: 'holePoints', index: i }; }}
                    onDoubleClick={() => removePoint(activeTrim.id, 'holePoints', i)}
                  />
                ))}
              </>
            )}

            {draggingRect && <DimHUD rect={draggingRect} w={img.width} h={img.height} />}
          </div>
        )}
      </div>

      <Panel>
        <PanelBody>
          <div style={{ ...TYPE.h2, color: COLOR.ink, margin: '0 0 4px' }}>{edit ? 'Xonani tahrirlash' : 'Yangi xona'}</div>
          <div style={{ ...TYPE.small, color: COLOR.inkSoft }}>
            Eshik turadigan <b>teshikni</b> to‘rtburchak bilan belgilang (u qorong‘i
            o‘yiqqa aylanadi), so‘ng pastda <b>nalichnikning</b> ranglanadigan
            qismlarini belgilang.
          </div>
          {img && box && (
            <>
              {/* What publish() will actually save — the recess painted in,
                  the wall light sampled — so that's seen before saving, not
                  just the box outline over the raw photo. */}
              <Label>Yakuniy ko‘rinish</Label>
              <div style={{ display: 'flex', justifyContent: 'center', background: COLOR.paper, border: `1px solid ${COLOR.line}`, borderRadius: RADIUS, padding: 10, minHeight: 100 }}>
                {finalPreview ? <img src={finalPreview} alt="" style={{ maxHeight: 180, borderRadius: RADIUS_SM }} /> : <span style={{ color: COLOR.inkSoft, fontSize: 12, alignSelf: 'center' }}>teshikni sozlang…</span>}
              </div>

              <Section title="Nomlanish">
                <Label>Nomi</Label>
                <input value={name} onChange={(e) => setName(e.target.value)} style={inp} placeholder="Masalan: Yorug‘ zal" />
              </Section>

              <Section title="Teshik">
                <Label>Kattalashtirish — {(zoom * 100).toFixed(0)}%</Label>
                {/* Dense, ornate trim (a fluted corona) needs many points close
                    together in the photo — 200% wasn't enough room on screen
                    to place them without adjacent 44px handles overlapping. */}
                <input type="range" min={0.08} max={8} step={0.02} value={zoom} onChange={(e) => setZoom(+e.target.value)} style={{ width: '100%' }} />
                <Label>Teshikni surish</Label>
                <MoveResize onMove={(dx, dy) => nudgeOpen(dx, dy, 'move')} onSize={(dx, dy) => nudgeOpen(dx, dy, 'size')} />
              </Section>

              <Section title="Nalichnik qismlari">
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: COLOR.inkSoft, lineHeight: 1.5 }}>
                    Bo‘yoq shu qismlarga tushadi. {trim.length === 0 && <span style={{ color: DANGER.text }}>Bo‘sh qoldirilsa, nalichnik oq bo‘lib qoladi.</span>}
                  </span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: COLOR.inkSoft, cursor: 'pointer', flex: '0 0 auto', marginLeft: 10 }}>
                    <input type="checkbox" checked={showTint} onChange={(e) => setShowTint(e.target.checked)} />
                    Ranglab ko‘rsatish
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
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
                          style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: TOUCH_MIN, padding: '7px 9px', borderRadius: RADIUS_SM, background: active ? 'rgba(143,113,69,.08)' : '#fff', border: `1px solid ${active ? meta.color : COLOR.line}`, cursor: 'pointer' }}
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
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, flex: '0 0 auto', background: 'none', border: 'none', color: DANGER.text, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}
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

                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: TOUCH_MIN, marginTop: 6, fontSize: 12, color: COLOR.ink, cursor: 'pointer' }}>
                              <input type="checkbox" checked={!!t.holePoints} onChange={() => toggleHole(t.id)} />
                              Ichki chegarani ham (qo‘lda) belgilash
                            </label>
                            {t.holePoints && (
                              <div style={{ fontSize: 11, color: COLOR.inkSoft, lineHeight: 1.5, marginBottom: 6 }}>
                                Kesilgan chiziq — nalichnikning eshikka qaragan ICHKI cheti. Xuddi
                                tashqi chetdek, suratdagi haqiqiy chiziqqa mos qilib torting —
                                taxminiy o‘lcham emas, o‘zingiz aniq belgilaysiz.
                              </div>
                            )}

                            <div style={{ marginTop: 8 }}>
                              <MoveResize onMove={(dx, dy) => nudgeTrim(t.id, dx, dy)} onSize={() => {}} sizeless />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Section>
            </>
          )}
        </PanelBody>
        {img && box && (
          <PanelFooter>
            <AdminPrimaryButton onClick={publish} disabled={busy}>
              {busy ? 'Saqlanmoqda…' : 'Katalogga qo‘shish ✓'}
            </AdminPrimaryButton>
          </PanelFooter>
        )}
      </Panel>
    </div>
  );
}
