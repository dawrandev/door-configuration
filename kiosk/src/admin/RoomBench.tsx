import { useCallback, useEffect, useRef, useState } from 'react';
import { COLOR, RADIUS, TYPE } from '../design/tokens';
import { processRoom, type Rect } from './roomProcess';
import { saveRoom, type AdminRoom } from './adminStore';
import { Panel, Label, inp, btn, linkBtn, dot } from './DoorBench';

function compactSource(el: HTMLImageElement, maxW = 1300): string {
  const scale = Math.min(1, maxW / el.width);
  const c = document.createElement('canvas');
  c.width = Math.round(el.width * scale);
  c.height = Math.round(el.height * scale);
  c.getContext('2d')!.drawImage(el, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
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
 */
export function RoomBench({ onDone, edit }: { onDone: () => void; edit?: AdminRoom }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [box, setBox] = useState<Rect | null>(null); // fractions
  const [zoom, setZoom] = useState(1);
  const [result, setResult] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<'tl' | 'br' | null>(null);

  useEffect(() => {
    if (!edit) return;
    setName(edit.name.uz);
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
    if (!drag.current || !box) return;
    const p = toFrac(e.clientX, e.clientY);
    setBox((b) => {
      if (!b) return b;
      if (drag.current === 'tl') {
        const nx = Math.min(Math.max(0, p.x), b.x + b.w - 0.05);
        const ny = Math.min(Math.max(0, p.y), b.y + b.h - 0.05);
        return { x: nx, y: ny, w: b.x + b.w - nx, h: b.y + b.h - ny };
      }
      const nr = Math.max(b.x + 0.05, Math.min(1, p.x));
      const nb = Math.max(b.y + 0.05, Math.min(1, p.y));
      return { ...b, w: nr - b.x, h: nb - b.y };
    });
  };
  const nudge = (dx: number, dy: number, kind: 'move' | 'size') =>
    setBox((b) => {
      if (!b || !img) return b;
      const fx = dx / img.width, fy = dy / img.height;
      return kind === 'move' ? { ...b, x: b.x + fx, y: b.y + fy } : { ...b, w: b.w + fx, h: b.h + fy };
    });

  const preview = () => {
    if (!img || !box) return;
    setResult(processRoom(img, box).image);
  };
  const publish = () => {
    if (!img || !box) return;
    const p = processRoom(img, box);
    saveRoom({
      id: edit?.id ?? 'a-' + Date.now().toString(36),
      name: { uz: name || 'Xona', kk: name || 'Bólme', ru: name || 'Комната' },
      image: p.image,
      aspect: p.aspect,
      open: box,
      light: p.light,
      createdAt: edit?.createdAt ?? Date.now(),
      source: source ?? edit?.source,
      box,
    });
    onDone();
  };

  const dispW = img ? img.width * zoom : 0;
  const dispH = img ? img.height * zoom : 0;

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
        {!img && (
          <label style={{ margin: 'auto', textAlign: 'center', cursor: 'pointer', border: '1.5px dashed #4a4640', borderRadius: RADIUS, padding: '64px 80px' }}>
            <div style={{ ...TYPE.h2, color: '#efece6', marginBottom: 8 }}>Xona rasmini yuklang</div>
            <div style={{ fontSize: 13, color: '#9d9790' }}>Eshik o‘rnini (teshikni) o‘zingiz belgilaysiz</div>
            <input type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
          </label>
        )}
        {img && box && (
          <div ref={wrapRef} style={{ position: 'relative', width: dispW, height: dispH, touchAction: 'none' }} onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
            <img src={img.src} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none' }} />
            <div style={{ position: 'absolute', left: box.x * dispW, top: box.y * dispH, width: box.w * dispW, height: box.h * dispH, border: `1.5px solid ${COLOR.brass}`, background: 'rgba(20,19,18,.35)' }} />
            <div onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); drag.current = 'tl'; }} style={dot(box.x * dispW, box.y * dispH)} />
            <div onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); drag.current = 'br'; }} style={dot((box.x + box.w) * dispW, (box.y + box.h) * dispH)} />
          </div>
        )}
      </div>

      <Panel>
        <button onClick={onDone} style={linkBtn}>← Ro‘yxatga qaytish</button>
        <div style={{ ...TYPE.h2, color: '#efece6', margin: '10px 0 4px' }}>{edit ? 'Xonani tahrirlash' : 'Yangi xona'}</div>
        <div style={{ fontSize: 13, color: '#9d9790', marginBottom: 18, lineHeight: 1.5 }}>Eshik turadigan <b>teshikni</b> to‘rtburchak bilan belgilang. U qorong‘i o‘yiqqa aylanadi.</div>
        {img && box && (
          <>
            <Label>Nomi</Label>
            <input value={name} onChange={(e) => setName(e.target.value)} style={inp} placeholder="Masalan: Yorug‘ zal" />
            <Label>Kattalashtirish — {(zoom * 100).toFixed(0)}%</Label>
            <input type="range" min={0.08} max={2} step={0.02} value={zoom} onChange={(e) => setZoom(+e.target.value)} style={{ width: '100%' }} />
            <Label>Teshikni surish</Label>
            <MoveResize onMove={(dx, dy) => nudge(dx, dy, 'move')} onSize={(dx, dy) => nudge(dx, dy, 'size')} />
            <button onClick={preview} style={{ ...btn, width: '100%', marginTop: 18, background: COLOR.brass, color: '#1b1a18' }}>Ko‘rish</button>
            {result && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'center', background: '#141312', borderRadius: RADIUS, padding: 10 }}>
                  <img src={result} alt="" style={{ maxHeight: 300, borderRadius: 4 }} />
                </div>
                <button onClick={publish} style={{ ...btn, width: '100%', marginTop: 10, background: '#2fbf71', color: '#0e2417' }}>Katalogga qo‘shish ✓</button>
              </div>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}

function MoveResize({ onMove, onSize }: { onMove: (dx: number, dy: number) => void; onSize: (dx: number, dy: number) => void }) {
  const cell = (t: string, fn: () => void) => (
    <button onClick={fn} style={{ background: '#2f2c29', border: '1px solid #454039', borderRadius: 5, color: '#cfcac3', cursor: 'pointer', fontSize: 11, padding: '6px 0' }}>{t}</button>
  );
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, color: '#8f8a83', marginBottom: 4 }}>O‘rni</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 3 }}>
          <span />{cell('▲', () => onMove(0, -8))}<span />
          {cell('◀', () => onMove(-8, 0))}<span />{cell('▶', () => onMove(8, 0))}
          <span />{cell('▼', () => onMove(0, 8))}<span />
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, color: '#8f8a83', marginBottom: 4 }}>O‘lchami</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
          {cell('En −', () => onSize(-8, 0))}{cell('En +', () => onSize(8, 0))}
          {cell('Bo‘y −', () => onSize(0, -8))}{cell('Bo‘y +', () => onSize(0, 8))}
        </div>
      </div>
    </div>
  );
}
