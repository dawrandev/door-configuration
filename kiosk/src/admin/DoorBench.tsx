import { useCallback, useEffect, useRef, useState } from 'react';
import { COLOR, FONT, RADIUS, TYPE } from '../design/tokens';
import { rectify, stripHandle, neutraliseWhite, type Pt } from './rectify';
import { saveLeaf, type AdminLeaf } from './adminStore';

/** Downscale an image to a compact JPEG data URL for storage/re-editing. */
function compactSource(el: HTMLImageElement, maxW = 1300): string {
  const scale = Math.min(1, maxW / el.width);
  const c = document.createElement('canvas');
  c.width = Math.round(el.width * scale);
  c.height = Math.round(el.height * scale);
  c.getContext('2d')!.drawImage(el, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

/**
 * Add a door: upload a photograph, drag the four corners of the door FACE onto
 * it, and publish a dead-on, professional leaf — the answer to the real
 * workflow, where sellers photograph doors at whatever angle they manage and the
 * client site must still look designer-made without a designer. The corners
 * drive a perspective correction, so the door that reaches the customer is the
 * exact door in the photo, only squared up. Nothing is generated.
 */
const LABELS = ['Yuqori chap', 'Yuqori o‘ng', 'Past o‘ng', 'Past chap'];
const HANDLE_OPTS: { id: 'left' | 'right' | 'none'; label: string }[] = [
  { id: 'left', label: 'Chapda' },
  { id: 'right', label: 'O‘ngda' },
  { id: 'none', label: 'Tegilmasin' },
];

export function DoorBench({ onDone, edit }: { onDone: () => void; edit?: AdminLeaf }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [white, setWhite] = useState(true);
  const [handleSide, setHandleSide] = useState<'left' | 'right' | 'none'>('left');
  const [corners, setCorners] = useState<Pt[]>([]);
  const [zoom, setZoom] = useState(1);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);

  /**
   * Reopen a saved door for adjustment. Its settings come back always; its
   * source and marks come back too when they were stored (doors added since the
   * source feature). A door saved before that has no source, so the bench keeps
   * the name and options but asks for the photo again — and republishes under
   * the same id, so it is edited, not duplicated.
   */
  useEffect(() => {
    if (!edit) return;
    setName(edit.name.uz);
    setWhite(edit.white ?? true);
    setHandleSide(edit.handleChoice ?? edit.handleSide);
    if (!edit.source) return;
    const el = new Image();
    el.onload = () => {
      setImg(el);
      setSource(edit.source!);
      setZoom(Math.min(1, (window.innerHeight - 150) / el.height));
      setCorners(
        edit.corners?.length === 4
          ? edit.corners.map((c) => ({ x: c.x * el.width, y: c.y * el.height }))
          : [
              { x: el.width * 0.28, y: el.height * 0.12 },
              { x: el.width * 0.72, y: el.height * 0.12 },
              { x: el.width * 0.72, y: el.height * 0.92 },
              { x: el.width * 0.28, y: el.height * 0.92 },
            ]
      );
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
      setCorners([
        { x: el.width * 0.28, y: el.height * 0.12 },
        { x: el.width * 0.72, y: el.height * 0.12 },
        { x: el.width * 0.72, y: el.height * 0.92 },
        { x: el.width * 0.28, y: el.height * 0.92 },
      ]);
      setResult(null);
      if (!name) setName(f.name.replace(/\.[^.]+$/, ''));
    };
    el.src = URL.createObjectURL(f);
  };

  const toImg = useCallback(
    (cx: number, cy: number) => {
      const r = wrapRef.current!.getBoundingClientRect();
      return { x: (cx - r.left) / zoom, y: (cy - r.top) / zoom };
    },
    [zoom]
  );
  const onMove = (e: React.PointerEvent) => {
    if (drag.current == null || !img) return;
    const p = toImg(e.clientX, e.clientY);
    setCorners((cs) => cs.map((c, i) => (i === drag.current ? { x: Math.max(0, Math.min(img.width, p.x)), y: Math.max(0, Math.min(img.height, p.y)) } : c)));
  };
  const nudge = (i: number, dx: number, dy: number) => setCorners((cs) => cs.map((c, k) => (k === i ? { x: c.x + dx, y: c.y + dy } : c)));

  const process = async () => {
    if (!img || corners.length !== 4) return;
    setBusy(true);
    await new Promise((r) => setTimeout(r, 20));
    const canvas = rectify(img, corners as [Pt, Pt, Pt, Pt]);
    stripHandle(canvas, handleSide);
    if (white) neutraliseWhite(canvas);
    // compact JPEG: a full PNG data URL blows the localStorage budget
    const scale = Math.min(1, 820 / canvas.width);
    const small = document.createElement('canvas');
    small.width = Math.round(canvas.width * scale);
    small.height = Math.round(canvas.height * scale);
    const sc = small.getContext('2d')!;
    sc.imageSmoothingQuality = 'high';
    sc.drawImage(canvas, 0, 0, small.width, small.height);
    setResult(small.toDataURL('image/jpeg', 0.82));
    setBusy(false);
  };

  const publish = () => {
    if (!result || !img) return;
    const [TL, TR, BR, BL] = corners;
    const topW = Math.hypot(TR.x - TL.x, TR.y - TL.y);
    const botW = Math.hypot(BR.x - BL.x, BR.y - BL.y);
    const hgt = (Math.hypot(BL.x - TL.x, BL.y - TL.y) + Math.hypot(BR.x - TR.x, BR.y - TR.y)) / 2;
    saveLeaf({
      id: edit?.id ?? 'a-' + Date.now().toString(36), // keep the id when re-editing
      name: { uz: name || 'Eshik', kk: name || 'Esik', ru: name || 'Дверь' },
      image: result,
      aspect: +(((topW + botW) / 2) / hgt).toFixed(4),
      handleSide: handleSide === 'none' ? 'left' : handleSide,
      handleSwappable: handleSide !== 'none',
      handleAt: handleSide !== 'none' ? { x: handleSide === 'left' ? 0.09 : 0.91, y: 0.56 } : undefined,
      createdAt: edit?.createdAt ?? Date.now(),
      // keep the source + marks so it can be reopened and adjusted again
      source: source ?? edit?.source,
      corners: corners.map((c) => ({ x: +(c.x / img.width).toFixed(4), y: +(c.y / img.height).toFixed(4) })),
      white,
      handleChoice: handleSide,
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
            <div style={{ ...TYPE.h2, color: '#efece6', marginBottom: 8 }}>Eshik rasmini yuklang</div>
            <div style={{ fontSize: 13, color: '#9d9790' }}>Istalgan burchakdan — 4 burchagini o‘zingiz belgilaysiz</div>
            <input type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
          </label>
        )}
        {img && (
          <div ref={wrapRef} style={{ position: 'relative', width: dispW, height: dispH, touchAction: 'none' }} onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
            <img src={img.src} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none' }} />
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              <polygon points={corners.map((c) => `${c.x * zoom},${c.y * zoom}`).join(' ')} fill="rgba(143,113,69,.14)" stroke={COLOR.brass} strokeWidth={1.5} />
            </svg>
            {corners.map((c, i) => (
              <div key={i} onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); drag.current = i; }} style={dot(c.x * zoom, c.y * zoom)} />
            ))}
          </div>
        )}
      </div>

      <Panel>
        <button onClick={onDone} style={{ ...linkBtn }}>← Ro‘yxatga qaytish</button>
        <div style={{ ...TYPE.h2, color: '#efece6', margin: '10px 0 4px' }}>{edit ? 'Eshikni tahrirlash' : 'Yangi eshik'}</div>
        <div style={{ fontSize: 13, color: '#9d9790', marginBottom: 18, lineHeight: 1.5 }}>Eshik <b>yuzasining</b> 4 burchagini belgilang — ramkani emas, tavaqani.</div>
        {img && (
          <>
            <Label>Nomi</Label>
            <input value={name} onChange={(e) => setName(e.target.value)} style={inp} placeholder="Masalan: Feruza klassik" />
            <Label>Rangi</Label>
            <Seg opts={[{ id: 't', label: 'Oq bo‘yoq' }, { id: 'f', label: 'Rangli' }]} value={white ? 't' : 'f'} onPick={(v) => setWhite(v === 't')} />
            <Label>Tutqich</Label>
            <Seg opts={HANDLE_OPTS} value={handleSide} onPick={(v) => setHandleSide(v as 'left' | 'right' | 'none')} />
            <Label>Kattalashtirish — {(zoom * 100).toFixed(0)}%</Label>
            <input type="range" min={0.08} max={2} step={0.02} value={zoom} onChange={(e) => setZoom(+e.target.value)} style={{ width: '100%' }} />
            <Label>Burchakni aniqlash</Label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {corners.map((_, i) => (
                <div key={i} style={{ background: '#1b1a18', borderRadius: RADIUS, padding: 8 }}>
                  <div style={{ fontSize: 11, color: '#9d9790', marginBottom: 5 }}>{LABELS[i]}</div>
                  <Pad onNudge={(dx, dy) => nudge(i, dx, dy)} />
                </div>
              ))}
            </div>
            <button onClick={process} disabled={busy} style={{ ...btn, width: '100%', marginTop: 18, background: COLOR.brass, color: '#1b1a18' }}>
              {busy ? 'Ishlanmoqda…' : 'Tekislab ko‘rish'}
            </button>
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

// ---- shared bits, also used by RoomBench ----
export const dot = (x: number, y: number): React.CSSProperties => ({
  position: 'absolute', left: x - 11, top: y - 11, width: 22, height: 22, borderRadius: 999,
  background: COLOR.brass, border: '2px solid #fff', boxShadow: '0 1px 6px rgba(0,0,0,.5)', cursor: 'grab', touchAction: 'none',
});
export const inp: React.CSSProperties = { width: '100%', marginTop: 6, padding: '9px 10px', borderRadius: RADIUS, background: '#1b1a18', color: '#efece6', border: '1px solid #454039', fontSize: 13, fontFamily: 'inherit' };
export const btn: React.CSSProperties = { padding: '12px 10px', borderRadius: RADIUS, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14 };
export const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#9d9790', cursor: 'pointer', fontSize: 13, padding: 0 };
export function Panel({ children }: { children: React.ReactNode }) {
  return <div style={{ width: 380, flex: '0 0 380px', height: '100%', overflowY: 'auto', padding: 24, background: '#232120', borderLeft: '1px solid #3a3733', fontFamily: FONT.sans }}>{children}</div>;
}
export function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, letterSpacing: '.09em', color: '#8f8a83', marginTop: 18, marginBottom: 2 }}>{children}</div>;
}
export function Seg({ opts, value, onPick }: { opts: { id: string; label: string }[]; value: string; onPick: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {opts.map((o) => {
        const on = o.id === value;
        return (
          <button key={o.id} onClick={() => onPick(o.id)} style={{ flex: 1, padding: '9px 6px', borderRadius: RADIUS, cursor: 'pointer', fontSize: 13, background: on ? COLOR.brass : 'transparent', color: on ? '#1b1a18' : '#cfcac3', border: `1px solid ${on ? COLOR.brass : '#454039'}`, fontWeight: on ? 600 : 400 }}>{o.label}</button>
        );
      })}
    </div>
  );
}
function Pad({ onNudge }: { onNudge: (dx: number, dy: number) => void }) {
  const b = (t: string, dx: number, dy: number) => (
    <button onClick={() => onNudge(dx, dy)} style={{ background: '#2f2c29', border: '1px solid #454039', borderRadius: 5, color: '#cfcac3', cursor: 'pointer', fontSize: 10, padding: '4px 0' }}>{t}</button>
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 3 }}>
      <span />{b('▲', 0, -2)}<span />
      {b('◀', -2, 0)}<span />{b('▶', 2, 0)}
      <span />{b('▼', 0, 2)}<span />
    </div>
  );
}
