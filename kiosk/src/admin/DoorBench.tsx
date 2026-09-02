import { useCallback, useEffect, useRef, useState } from 'react';
import { COLOR, RADIUS, RADIUS_SM, TOUCH_MIN, TYPE } from '../design/tokens';
import { rectify, stripHandle, neutraliseWhite, type Pt } from './rectify';
import { saveLeaf, mergeColors, saveColor, type AdminLeaf, type AdminColor } from './adminStore';
import { COLORS as BASE_COLORS, type DoorColor } from '../catalog/colors';
import {
  Panel, PanelBody, PanelFooter, Label, Section, inp, AdminPrimaryButton, AdminGhostButton, Seg, Pad, Handle, DANGER, useToast,
} from './adminKit';

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

export function DoorBench({ onDone, edit }: { onDone: () => void; edit?: AdminLeaf }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [white, setWhite] = useState(true);
  // Handle logic is off for now: doors are shown with the handle they were
  // photographed with, not stripped and re-fitted. Kept as a constant rather
  // than deleted so it is one line to switch back on.
  const handleSide: 'left' | 'right' | 'none' = 'none';
  const [corners, setCorners] = useState<Pt[]>([]);
  const [zoom, setZoom] = useState(1);
  const [result, setResult] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  // The colour registry — built-ins plus anything a bench has ever added,
  // same merge pattern as leaves/rooms. Kept in local state, not the global
  // store, since only this bench adds to it while it's open. `'oq'` (as
  // photographed) is never in this list — it isn't a paint, and every leaf
  // gets it regardless of `colorIds`, so there is nothing to assign.
  const [colors, setColors] = useState<DoorColor[]>(() => mergeColors(BASE_COLORS).filter((c) => c.id !== 'oq'));
  const [selected, setSelected] = useState<Set<string>>(() => new Set(colors.map((c) => c.id)));
  const [newColorName, setNewColorName] = useState('');
  const [newColorHex, setNewColorHex] = useState('#8F7145');

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
    setSelected(new Set(edit.colorIds ?? colors.map((c) => c.id)));
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

  const toggleColor = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Register a brand-new paint — reusable on every future door via the
   *  checkbox above, never re-typed again. */
  const addColor = () => {
    const hex = /^#[0-9a-fA-F]{6}$/.test(newColorHex) ? newColorHex : null;
    if (!hex || !newColorName.trim()) return;
    const color: AdminColor = {
      id: 'a-' + Date.now().toString(36),
      name: { uz: newColorName, kk: newColorName, ru: newColorName },
      hex,
      createdAt: Date.now(),
    };
    saveColor(color);
    setColors((cs) => [...cs, color]);
    setSelected((s) => new Set(s).add(color.id));
    setNewColorName('');
    setNewColorHex('#8F7145');
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

  /**
   * A live preview at low resolution.
   *
   * The whole difficulty of this tool is placing four corners on a door seen at
   * an angle: a corner a few pixels off the door face pulls a wedge of dark
   * background into the result, and the fluted panels make any skew glaring. So
   * the rectify runs continuously at ~300px — cheap enough to redo on every
   * drag — and the fixed result appears beside the photo as the corners move,
   * turning "mark, render, discover it is wrong, start over" into "drag until it
   * looks right".
   */
  const [live, setLive] = useState<string | null>(null);
  useEffect(() => {
    if (!img || corners.length !== 4) { setLive(null); return; }
    const t = window.setTimeout(() => {
      try {
        const c = rectify(img, corners as [Pt, Pt, Pt, Pt], 300);
        stripHandle(c, handleSide);
        if (white) neutraliseWhite(c);
        setLive(c.toDataURL('image/jpeg', 0.8));
      } catch { /* a degenerate quad mid-drag — ignore, the next frame recovers */ }
    }, 80);
    return () => window.clearTimeout(t);
  }, [img, corners, white, handleSide]);

  /** An optional, full-resolution "is this really right?" look, shown inline
   *  below the live preview — publish() itself always renders at full
   *  quality regardless, so this is reassurance, not a required step. */
  const check = async () => {
    if (!img || corners.length !== 4) return;
    setChecking(true);
    await new Promise((r) => setTimeout(r, 20));
    const canvas = rectify(img, corners as [Pt, Pt, Pt, Pt]);
    stripHandle(canvas, handleSide);
    if (white) neutraliseWhite(canvas);
    const scale = Math.min(1, 820 / canvas.width);
    const small = document.createElement('canvas');
    small.width = Math.round(canvas.width * scale);
    small.height = Math.round(canvas.height * scale);
    const sc = small.getContext('2d')!;
    sc.imageSmoothingQuality = 'high';
    sc.drawImage(canvas, 0, 0, small.width, small.height);
    setResult(small.toDataURL('image/jpeg', 0.82));
    setChecking(false);
  };

  const publish = () => {
    if (!img || corners.length !== 4) return;
    setBusy(true);
    // Render the door at full quality now — publishing never depends on
    // the optional check() above having been run.
    const canvas = rectify(img, corners as [Pt, Pt, Pt, Pt]);
    stripHandle(canvas, handleSide);
    if (white) neutraliseWhite(canvas);
    // compact JPEG: a full PNG data URL blows the localStorage budget
    const scale = Math.min(1, 820 / canvas.width);
    const small = document.createElement('canvas');
    small.width = Math.round(canvas.width * scale);
    small.height = Math.round(canvas.height * scale);
    small.getContext('2d')!.drawImage(canvas, 0, 0, small.width, small.height);
    const image = small.toDataURL('image/jpeg', 0.82);

    const [TL, TR, BR, BL] = corners;
    const topW = Math.hypot(TR.x - TL.x, TR.y - TL.y);
    const botW = Math.hypot(BR.x - BL.x, BR.y - BL.y);
    const hgt = (Math.hypot(BL.x - TL.x, BL.y - TL.y) + Math.hypot(BR.x - TR.x, BR.y - TR.y)) / 2;
    saveLeaf({
      id: edit?.id ?? 'a-' + Date.now().toString(36),
      name: { uz: name || 'Eshik', kk: name || 'Esik', ru: name || 'Дверь' },
      image,
      aspect: +(((topW + botW) / 2) / hgt).toFixed(4),
      handleSide: handleSide === 'none' ? 'left' : handleSide,
      handleSwappable: handleSide !== 'none',
      handleAt: handleSide !== 'none' ? { x: handleSide === 'left' ? 0.09 : 0.91, y: 0.56 } : undefined,
      createdAt: edit?.createdAt ?? Date.now(),
      source: source ?? edit?.source,
      corners: corners.map((c) => ({ x: +(c.x / img.width).toFixed(4), y: +(c.y / img.height).toFixed(4) })),
      white,
      handleChoice: handleSide,
      // Leaving it as "all currently registered" is stored as undefined, not
      // a frozen list — so this door also picks up any colour registered
      // AFTER today, exactly like it would have before this feature existed.
      colorIds: selected.size === colors.length ? undefined : [...selected],
    });
    setBusy(false);
    toast('Saqlandi ✓');
    onDone();
  };

  const dispW = img ? img.width * zoom : 0;
  const dispH = img ? img.height * zoom : 0;

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', minHeight: 0 }}>
      <div className="scr" style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: COLOR.studio }}>
        {!img && (
          <label style={{ margin: 'auto', textAlign: 'center', cursor: 'pointer', border: `1.5px dashed ${COLOR.lineStrong}`, borderRadius: RADIUS, padding: '64px 80px', background: '#fff' }}>
            <div style={{ ...TYPE.h2, color: COLOR.ink, marginBottom: 8 }}>Eshik rasmini yuklang</div>
            <div style={{ ...TYPE.small, color: COLOR.inkSoft }}>Istalgan burchakdan — 4 burchagini o‘zingiz belgilaysiz</div>
            <input type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
          </label>
        )}
        {img && (
          <div ref={wrapRef} style={{ position: 'relative', width: dispW, height: dispH, flexShrink: 0, touchAction: 'none' }} onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
            <img src={img.src} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none' }} />
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              <polygon points={corners.map((c) => `${c.x * zoom},${c.y * zoom}`).join(' ')} fill="rgba(143,113,69,.16)" stroke={COLOR.brass} strokeWidth={2} />
            </svg>
            {corners.map((c, i) => (
              <Handle key={i} x={c.x * zoom} y={c.y * zoom} onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); drag.current = i; }} />
            ))}
          </div>
        )}
      </div>

      <Panel>
        <PanelBody>
          <div style={{ ...TYPE.h2, color: COLOR.ink, margin: '0 0 4px' }}>{edit ? 'Eshikni tahrirlash' : 'Yangi eshik'}</div>
          <div style={{ ...TYPE.small, color: COLOR.inkSoft }}>Eshik <b>yuzasining</b> 4 burchagini belgilang — ramkani emas, tavaqani.</div>
          {img && (
            <>
              {/* live result — updates as the corners move, so a bad mark is seen at once */}
              <Label>Jonli ko‘rinish</Label>
              <div style={{ display: 'flex', justifyContent: 'center', background: COLOR.paper, border: `1px solid ${COLOR.line}`, borderRadius: RADIUS, padding: 10, minHeight: 150 }}>
                {live ? <img src={live} alt="" style={{ maxHeight: 240, borderRadius: RADIUS_SM }} /> : <span style={{ color: COLOR.inkSoft, fontSize: 12, alignSelf: 'center' }}>burchaklarni sozlang…</span>}
              </div>

              <Section title="Nomlanish">
                <Label>Nomi</Label>
                <input value={name} onChange={(e) => setName(e.target.value)} style={inp} placeholder="Masalan: Feruza klassik" />
                <Label>Rangi</Label>
                <Seg opts={[{ id: 't', label: 'Oq bo‘yoq' }, { id: 'f', label: 'Rangli' }]} value={white ? 't' : 'f'} onPick={(v) => setWhite(v === 't')} />
              </Section>

              <Section title="Ranglar — mijoz shu eshik uchun tanlay oladi">
                {selected.size === 0 && (
                  <div style={{ fontSize: 12, color: DANGER.text, marginBottom: 8 }}>
                    Birorta rang belgilanmagan — mijoz faqat "Oq" (fotosuratdagidek) holatda ko‘radi.
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {colors.map((c) => {
                    const on = selected.has(c.id);
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggleColor(c.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 7, minHeight: TOUCH_MIN, padding: '6px 14px 6px 8px', borderRadius: 999, fontFamily: 'inherit',
                          border: `1px solid ${on ? COLOR.brass : COLOR.lineStrong}`, background: on ? 'rgba(143,113,69,.1)' : '#fff',
                          color: COLOR.ink, fontSize: 13, cursor: 'pointer',
                        }}
                      >
                        <span style={{ width: 18, height: 18, borderRadius: 999, background: c.hex, boxShadow: `inset 0 0 0 1px ${COLOR.lineStrong}`, flex: '0 0 auto' }} />
                        {c.name.uz}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 10 }}>
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(newColorHex) ? newColorHex : '#8F7145'}
                    onChange={(e) => setNewColorHex(e.target.value)}
                    style={{ width: TOUCH_MIN, height: TOUCH_MIN, padding: 0, border: `1px solid ${COLOR.lineStrong}`, borderRadius: RADIUS_SM, background: 'none', cursor: 'pointer', flex: '0 0 auto' }}
                  />
                  <input value={newColorHex} onChange={(e) => setNewColorHex(e.target.value)} style={{ ...inp, margin: 0, width: 90 }} placeholder="#8F7145" />
                  <input value={newColorName} onChange={(e) => setNewColorName(e.target.value)} style={{ ...inp, margin: 0, flex: 1 }} placeholder="Rang nomi" />
                  <AdminGhostButton onClick={addColor} style={{ width: 'auto', minHeight: TOUCH_MIN, padding: '0 14px', fontSize: 13 }}>+ Qo‘shish</AdminGhostButton>
                </div>
              </Section>

              <Section title="Joylashuv">
                <Label>Kattalashtirish — {(zoom * 100).toFixed(0)}%</Label>
                <input type="range" min={0.08} max={2} step={0.02} value={zoom} onChange={(e) => setZoom(+e.target.value)} style={{ width: '100%' }} />
                <Label>Burchakni aniqlash</Label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {corners.map((_, i) => (
                    <div key={i} style={{ background: '#fff', border: `1px solid ${COLOR.line}`, borderRadius: RADIUS, padding: 8 }}>
                      <div style={{ fontSize: 11, color: COLOR.inkSoft, marginBottom: 5 }}>{LABELS[i]}</div>
                      <Pad onNudge={(dx, dy) => nudge(i, dx, dy)} />
                    </div>
                  ))}
                </div>
              </Section>

              {result && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 11, color: COLOR.inkSoft, marginBottom: 6 }}>Yakuniy sifat:</div>
                  <div style={{ display: 'flex', justifyContent: 'center', background: COLOR.paper, border: `1px solid ${COLOR.line}`, borderRadius: RADIUS, padding: 10 }}>
                    <img src={result} alt="" style={{ maxHeight: 300, borderRadius: RADIUS_SM }} />
                  </div>
                </div>
              )}
            </>
          )}
        </PanelBody>
        {img && (
          <PanelFooter>
            <div style={{ display: 'flex', gap: 8 }}>
              <AdminGhostButton onClick={check} disabled={checking} style={{ flex: 1 }}>
                {checking ? 'Ishlanmoqda…' : 'Yakuniy sifatda tekshirish'}
              </AdminGhostButton>
              <AdminPrimaryButton onClick={publish} disabled={!live || busy} style={{ flex: 1 }}>
                {busy ? 'Saqlanmoqda…' : 'Qo‘shish ✓'}
              </AdminPrimaryButton>
            </div>
          </PanelFooter>
        )}
      </Panel>
    </div>
  );
}
