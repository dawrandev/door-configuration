import { useCallback, useEffect, useRef, useState } from 'react';
import { COLOR, RADIUS, RADIUS_SM, TYPE } from '../design/tokens';
import { rectify, type Pt, type Margin } from './rectify';
import { saveTrimModel, type AdminTrim } from './adminStore';
import {
  Panel, PanelBody, PanelFooter, Label, Section, inp, AdminPrimaryButton, Handle, Pad, DANGER, useToast, ROLE_ORDER, ROLE_META, RoleChip, MoveResize,
} from './adminKit';
import { bboxOfPoints, seedPoints, defaultRectFor, nearestLoop, toStoredTrim, toTrimState, type TrimPieceState } from './trimGeometry';
import type { TrimRole } from '../catalog/types';

/** Downscale an image to a compact JPEG data URL for storage/re-editing. */
function compactSource(el: HTMLImageElement, maxW = 1300): string {
  const scale = Math.min(1, maxW / el.width);
  const c = document.createElement('canvas');
  c.width = Math.round(el.width * scale);
  c.height = Math.round(el.height * scale);
  c.getContext('2d')!.drawImage(el, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

const LABELS = ['Yuqori chap', 'Yuqori o‘ng', 'Past o‘ng', 'Past chap'];

/**
 * Add a nalichnik/korona DESIGN: upload a photograph (the trim as installed,
 * or a flat sample), mark the four corners of the OPENING it surrounds —
 * not a door face, since no door is attached — then open a margin and trace
 * the pieces. Structurally a trimmed-down clone of DoorBench's "O'z
 * nalichnigini chizish" flow: same `rectify()` margin mechanism, same
 * point-editing tool (`trimGeometry.ts`), same role chips/list chrome
 * (`adminKit.tsx`) — everything leaf-specific (colours, handle stripping,
 * white balance, `trimRoles`) simply doesn't apply here and is left out.
 */
export function TrimBench({ onDone, edit }: { onDone: () => void; edit?: AdminTrim }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [corners, setCorners] = useState<Pt[]>([]);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const [margin, setMargin] = useState(0.15);
  const [trim, setTrim] = useState<TrimPieceState[]>([]);
  const [activeTrimId, setActiveTrimId] = useState<string | null>(null);
  const [paddedImg, setPaddedImg] = useState<HTMLImageElement | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const trimWrapRef = useRef<HTMLDivElement>(null);
  const trimDrag = useRef<{ trimId: string; loop: 'points' | 'holePoints'; index: number } | null>(null);

  /** Reopen a saved design for adjustment — mirrors DoorBench's reopen effect. */
  useEffect(() => {
    if (!edit) return;
    setName(edit.name.uz);
    setMargin(edit.trimMargin.left);
    setTrim(edit.trimBoxes.map((b, i) => toTrimState(`${b.role ?? 'extra'}-${i}`, b)));
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
      setMargin(0.15);
      setTrim([]);
      setActiveTrimId(null);
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

  const marginObj: Margin = { left: margin, right: margin, top: margin, bottom: margin };
  /** Where the notional opening sits within the padded canvas, as fractions
   *  of THAT canvas — what a fresh trim piece is measured against. */
  const paddedFrac = 1 + margin * 2;
  const openRef = { x: margin / paddedFrac, y: margin / paddedFrac, w: 1 / paddedFrac, h: 1 / paddedFrac };

  /** A live, low-res look at the padded/rectified crop trim gets traced on
   *  — always active once corners exist, since tracing IS this bench's
   *  whole purpose (unlike DoorBench, where it's an opt-in extra). */
  useEffect(() => {
    if (!img || corners.length !== 4) { setPaddedImg(null); return; }
    let live = true;
    const t = window.setTimeout(() => {
      try {
        const c = rectify(img, corners as [Pt, Pt, Pt, Pt], 500, marginObj);
        const el = new Image();
        el.onload = () => { if (live) setPaddedImg(el); };
        el.src = c.toDataURL('image/jpeg', 0.85);
      } catch { /* a degenerate quad mid-drag — ignore, the next frame recovers */ }
    }, 120);
    return () => { live = false; window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [img, corners, margin]);

  const toTrimFrac = useCallback((cx: number, cy: number) => {
    const r = trimWrapRef.current!.getBoundingClientRect();
    return { x: Math.min(Math.max(0, (cx - r.left) / r.width), 1), y: Math.min(Math.max(0, (cy - r.top) / r.height), 1) };
  }, []);
  const onTrimMove = (e: React.PointerEvent) => {
    if (!trimDrag.current) return;
    const { trimId, loop, index } = trimDrag.current;
    const p = toTrimFrac(e.clientX, e.clientY);
    setTrim((ts) => ts.map((t) => {
      if (t.id !== trimId) return t;
      const source = t[loop] ?? [];
      const updated = source.map((pt, i) => (i === index ? p : pt));
      return loop === 'points' ? { ...t, points: updated, rect: bboxOfPoints(updated) } : { ...t, holePoints: updated };
    }));
  };
  const addTrimPiece = (role: TrimRole) => {
    const id = role === 'extra' ? `extra-${Date.now().toString(36)}` : role;
    const rect = defaultRectFor(role, openRef, trim);
    const label = role === 'extra' ? `Boshqa ${trim.filter((t) => t.role === 'extra').length + 1}` : undefined;
    setTrim((ts) => [...ts, { id, role, label, rect, points: seedPoints(rect) }]);
    setActiveTrimId(id);
  };
  const removeTrimPiece = (id: string) => {
    setTrim((ts) => ts.filter((t) => t.id !== id));
    setActiveTrimId((a) => (a === id ? null : a));
  };
  const toggleTrimHole = (trimId: string) => {
    setTrim((ts) => ts.map((t) => (t.id === trimId ? { ...t, holePoints: t.holePoints ? undefined : seedPoints(openRef) } : t)));
  };
  const removeTrimPoint = (trimId: string, loop: 'points' | 'holePoints', index: number) => {
    setTrim((ts) => ts.map((t) => {
      const source = t[loop];
      if (t.id !== trimId || !source || source.length <= 3) return t;
      const updated = source.filter((_, i) => i !== index);
      return loop === 'points' ? { ...t, points: updated, rect: bboxOfPoints(updated) } : { ...t, holePoints: updated };
    }));
  };
  const nudgeTrimPiece = (trimId: string, dx: number, dy: number) => {
    if (!paddedImg) return;
    const fx = dx / paddedImg.width, fy = dy / paddedImg.height;
    const shift = (pts: { x: number; y: number }[]) => pts.map((p) => ({ x: p.x + fx, y: p.y + fy }));
    setTrim((ts) => ts.map((t) => {
      if (t.id !== trimId) return t;
      const points = shift(t.points);
      return { ...t, points, rect: bboxOfPoints(points), holePoints: t.holePoints && shift(t.holePoints) };
    }));
  };
  const onTrimAddPoint = (e: React.PointerEvent) => {
    if (trimDrag.current) return;
    const active = trim.find((t) => t.id === activeTrimId);
    if (!active) return;
    const p = toTrimFrac(e.clientX, e.clientY);
    const { loop, index: idx } = nearestLoop(active, p);
    setTrim((ts) => ts.map((t) => {
      if (t.id !== active.id) return t;
      const source = t[loop] ?? [];
      const updated = [...source.slice(0, idx), p, ...source.slice(idx)];
      return loop === 'points' ? { ...t, points: updated, rect: bboxOfPoints(updated) } : { ...t, holePoints: updated };
    }));
    (e.target as Element).setPointerCapture(e.pointerId);
    trimDrag.current = { trimId: active.id, loop, index: idx };
  };

  const publish = () => {
    if (!img || corners.length !== 4 || trim.length === 0) return;
    setBusy(true);
    const tc = rectify(img, corners as [Pt, Pt, Pt, Pt], 1200, marginObj);
    const scale = Math.min(1, 1000 / tc.width);
    const small = document.createElement('canvas');
    small.width = Math.round(tc.width * scale);
    small.height = Math.round(tc.height * scale);
    small.getContext('2d')!.drawImage(tc, 0, 0, small.width, small.height);
    const trimSource = small.toDataURL('image/jpeg', 0.85);

    saveTrimModel({
      id: edit?.id ?? 'a-' + Date.now().toString(36),
      name: { uz: name || 'Nalichnik', kk: name || 'Naličnik', ru: name || 'Наличник' },
      trimMargin: marginObj,
      trimBoxes: trim.map(toStoredTrim),
      trimSource,
      createdAt: edit?.createdAt ?? Date.now(),
      source: source ?? edit?.source,
      corners: corners.map((c) => ({ x: +(c.x / img.width).toFixed(4), y: +(c.y / img.height).toFixed(4) })),
    });
    setBusy(false);
    toast('Saqlandi ✓');
    onDone();
  };

  const dispW = img ? img.width * zoom : 0;
  const dispH = img ? img.height * zoom : 0;
  const activeTrim = trim.find((t) => t.id === activeTrimId) ?? null;
  const showTrimStudio = activeTrim && paddedImg;
  const tDispW = paddedImg ? paddedImg.width * zoom : 0;
  const tDispH = paddedImg ? paddedImg.height * zoom : 0;

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', minHeight: 0 }}>
      <div className="scr" style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', background: COLOR.studio }}>
        {!img && (
          <label style={{ margin: 'auto', textAlign: 'center', cursor: 'pointer', border: `1.5px dashed ${COLOR.lineStrong}`, borderRadius: RADIUS, padding: '64px 80px', background: '#fff' }}>
            <div style={{ ...TYPE.h2, color: COLOR.ink, marginBottom: 8 }}>Nalichnik rasmini yuklang</div>
            <div style={{ ...TYPE.small, color: COLOR.inkSoft }}>O‘rnatilgan holatda yoki namuna sifatida — atrofida haqiqiy nalichnik ko‘rinib turishi kerak</div>
            <input type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
          </label>
        )}
        {img && !showTrimStudio && (
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
        {showTrimStudio && (
          <div
            ref={trimWrapRef}
            style={{ position: 'relative', width: tDispW, height: tDispH, flexShrink: 0, touchAction: 'none' }}
            onPointerMove={onTrimMove}
            onPointerUp={() => (trimDrag.current = null)}
            onPointerDown={onTrimAddPoint}
          >
            <img src={paddedImg!.src} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none' }} />
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              {/* The notional opening within the padded canvas — a fixed
                  reference so it's clear where the "door" would sit and the
                  revealed casing begins. */}
              <rect x={openRef.x * tDispW} y={openRef.y * tDispH} width={openRef.w * tDispW} height={openRef.h * tDispH} fill="none" stroke={COLOR.lineStrong} strokeDasharray="5 4" strokeWidth={1.5} />
              <polygon
                points={activeTrim!.points.map((p) => `${p.x * tDispW},${p.y * tDispH}`).join(' ')}
                fill="rgba(35,32,27,.15)"
                stroke={ROLE_META[activeTrim!.role].color}
                strokeWidth={2}
              />
              {activeTrim!.holePoints && (
                <polygon
                  points={activeTrim!.holePoints.map((p) => `${p.x * tDispW},${p.y * tDispH}`).join(' ')}
                  fill="rgba(255,255,255,.28)"
                  stroke={ROLE_META[activeTrim!.role].color}
                  strokeWidth={2}
                  strokeDasharray="6 5"
                />
              )}
            </svg>
            {activeTrim!.points.map((p, i) => (
              <Handle
                key={`o${i}`}
                x={p.x * tDispW}
                y={p.y * tDispH}
                color={ROLE_META[activeTrim!.role].color}
                onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture(e.pointerId); trimDrag.current = { trimId: activeTrim!.id, loop: 'points', index: i }; }}
                onDoubleClick={() => removeTrimPoint(activeTrim!.id, 'points', i)}
              />
            ))}
            {activeTrim!.holePoints?.map((p, i) => (
              <Handle
                key={`h${i}`}
                x={p.x * tDispW}
                y={p.y * tDispH}
                color={ROLE_META[activeTrim!.role].color}
                onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture(e.pointerId); trimDrag.current = { trimId: activeTrim!.id, loop: 'holePoints', index: i }; }}
                onDoubleClick={() => removeTrimPoint(activeTrim!.id, 'holePoints', i)}
              />
            ))}
          </div>
        )}
      </div>

      <Panel>
        <PanelBody>
          <div style={{ ...TYPE.h2, color: COLOR.ink, margin: '0 0 4px' }}>{edit ? 'Nalichnikni tahrirlash' : 'Yangi nalichnik'}</div>
          <div style={{ ...TYPE.small, color: COLOR.inkSoft }}>Eshik turadigan <b>o‘rinni</b> to‘rtburchak bilan belgilang, so‘ng atrofdagi nalichnikni oching va chizing.</div>
          {img && (
            <>
              <Section title="Nomlanish">
                <Label>Nomi</Label>
                <input value={name} onChange={(e) => setName(e.target.value)} style={inp} placeholder="Masalan: Klassik oq korona" />
              </Section>

              <Section title="Nalichnikni chizish">
                <Label>Atrofni ochish — {(margin * 100).toFixed(0)}%</Label>
                <input type="range" min={0.03} max={0.4} step={0.01} value={margin} onChange={(e) => setMargin(+e.target.value)} style={{ width: '100%' }} />

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                  {ROLE_ORDER.map((role) => {
                    const present = trim.some((t) => t.role === role);
                    return (
                      <RoleChip key={role} label={ROLE_META[role].label} color={ROLE_META[role].color} disabled={present} onClick={() => addTrimPiece(role)} />
                    );
                  })}
                  <RoleChip label="Boshqa" color={ROLE_META.extra.color} onClick={() => addTrimPiece('extra')} />
                </div>

                <div style={{ marginTop: 10 }}>
                  {trim.map((t) => {
                    const meta = ROLE_META[t.role];
                    const active = t.id === activeTrimId;
                    return (
                      <div key={t.id} style={{ marginTop: 6 }}>
                        <div
                          onClick={() => setActiveTrimId(active ? null : t.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '7px 9px', borderRadius: RADIUS_SM, background: active ? 'rgba(143,113,69,.08)' : '#fff', border: `1px solid ${active ? meta.color : COLOR.line}`, cursor: 'pointer' }}
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
                            onClick={(e) => { e.stopPropagation(); removeTrimPiece(t.id); }}
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

                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, marginTop: 6, fontSize: 12, color: COLOR.ink, cursor: 'pointer' }}>
                              <input type="checkbox" checked={!!t.holePoints} onChange={() => toggleTrimHole(t.id)} />
                              Ichki chegarani ham (qo‘lda) belgilash
                            </label>

                            <div style={{ marginTop: 8 }}>
                              <MoveResize onMove={(dx, dy) => nudgeTrimPiece(t.id, dx, dy)} onSize={() => {}} sizeless />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {trim.length === 0 && (
                  <div style={{ fontSize: 12, color: DANGER.text, marginTop: 8 }}>
                    Birorta qism chizilmagan — kamida bittasi bo‘lmasa, saqlash mumkin emas.
                  </div>
                )}
              </Section>

              <Section title="Joylashuv">
                <Label>Kattalashtirish — {(zoom * 100).toFixed(0)}%</Label>
                <input type="range" min={0.08} max={8} step={0.02} value={zoom} onChange={(e) => setZoom(+e.target.value)} style={{ width: '100%' }} />
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
            </>
          )}
        </PanelBody>
        {img && (
          <PanelFooter>
            <AdminPrimaryButton onClick={publish} disabled={trim.length === 0 || busy}>
              {busy ? 'Saqlanmoqda…' : 'Qo‘shish ✓'}
            </AdminPrimaryButton>
          </PanelFooter>
        )}
      </Panel>
    </div>
  );
}
