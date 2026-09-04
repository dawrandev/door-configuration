import { useCallback, useEffect, useRef, useState } from 'react';
import { COLOR, RADIUS, RADIUS_SM, TOUCH_MIN, TYPE } from '../design/tokens';
import { rectify, stripHandle, neutraliseWhite, encodeAlpha, type Pt, type Margin } from './rectify';
import { saveLeaf, saveTrimModel, mergeColors, saveColor, STORAGE_FULL, type AdminLeaf, type AdminColor, type AdminTrim } from './adminStore';
import { COLORS as BASE_COLORS, type DoorColor } from '../catalog/colors';
import {
  Panel, PanelBody, PanelFooter, Label, Section, inp, AdminPrimaryButton, AdminGhostButton, Seg, Pad, Handle, DANGER, useToast, ROLE_ORDER, ROLE_META, RoleChip, MoveResize,
} from './adminKit';
import { bboxOfPoints, seedPoints, defaultRectFor, nearestLoop, toStoredTrim, type TrimPieceState } from './trimGeometry';
import { maskTrim, useRender } from '../render/recolor';
import type { TrimRole } from '../catalog/types';

/** Every role offered when marking which nalichnik/korona pieces a door
 *  comes with — the four standard ones plus "Boshqa", so a door that comes
 *  with some one-off extra piece a room happens to have can still include
 *  it. */
const DOOR_TRIM_ROLES: TrimRole[] = [...ROLE_ORDER, 'extra'];

/** Which traced roles land in the nalichnik catalog entry versus the korona
 *  one when tracing during door-add gets split at publish — see
 *  `publish()`. A crown is the only korona-family role; everything else
 *  (the shaft, feet, and unlabelled "extra" pieces) is nalichnik-family. */
const NALICHNIK_ROLES: TrimRole[] = ['shaft', 'footL', 'footR', 'extra'];

/** Adding a door walks these in order. The door itself is always cut; the
 *  two trim stages are each skippable, and each is judged on its own cut-out
 *  before moving on. */
type Stage = 'door' | 'nalichnik' | 'korona' | 'finish';
const STAGES: { id: Stage; label: string }[] = [
  { id: 'door', label: 'Eshik' },
  { id: 'nalichnik', label: 'Nalichnik' },
  { id: 'korona', label: 'Korona' },
  { id: 'finish', label: 'Yakunlash' },
];
/** Which roles each trim stage offers. */
const STAGE_ROLES: Record<'nalichnik' | 'korona', TrimRole[]> = {
  nalichnik: ['shaft'],
  korona: ['crown'],
};

/**
 * A nalichnik is the two vertical casings flanking the door — the left one
 * and the right one, each running the full height and taking in the plinth
 * block at its foot. It is NOT a ring: the band across the top is the
 * korona's, and cutting one shape around the whole door swept that top band,
 * and usually a strip of the wall past the casing, in with it.
 *
 * So the stage opens with exactly these two strips, each traced on its own.
 */
const NALICHNIK_SIDES = [
  { id: 'shaft-left', label: 'Chap nalichnik' },
  { id: 'shaft-right', label: 'O‘ng nalichnik' },
] as const;

/**
 * The widest reveal this particular photograph can actually support.
 *
 * The rectify only has the camera's own pixels to draw on, so past some width
 * the margin is empty rather than casing — and where that limit falls depends
 * entirely on how tightly the door was framed, which is not a thing to ask an
 * operator to guess at with a slider. Measured at thumbnail size, so trying
 * several widths costs nothing.
 */
function fitMargin(img: HTMLImageElement, corners: [Pt, Pt, Pt, Pt]): number {
  for (const m of [0.4, 0.32, 0.26, 0.2, 0.15, 0.1, 0.06]) {
    try {
      const c = rectify(img, corners, 180, { left: m, right: m, top: m, bottom: m });
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let empty = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] === 0) empty++;
      if (empty / (c.width * c.height) < 0.02) return m;
    } catch { /* a degenerate quad — fall through to the narrowest reveal */ }
  }
  return 0.06;
}

/** A starting strip down one side of the door, inside the revealed margin.
 *  `ref` is the leaf's own rect within the padded canvas, so `ref.x` is
 *  exactly how much photo was revealed beside it. */
function sideStrip(side: 'left' | 'right', ref: { x: number; y: number; w: number; h: number }) {
  const reveal = ref.x;
  return {
    x: side === 'left' ? reveal * 0.15 : ref.x + ref.w - reveal * 0.1,
    y: ref.y,
    w: reveal * 0.95,
    // Down past the leaf's foot, where the plinth block sits.
    h: Math.min(ref.h + ref.y * 0.6, 1 - ref.y),
  };
}
const STAGE_HINT: Record<Stage, string> = {
  door: 'Eshik yuzasining 4 burchagini belgilang — ramkani emas, tavaqani.',
  nalichnik: 'Eshikning ikki yonidagi nalichniklarni chizing — tepasi emas, u korona. Bu eshikda bo‘lmasa, o‘tkazib yuboring.',
  korona: 'Eshik tepasidagi koronani chizing. Bu eshikda bo‘lmasa, o‘tkazib yuboring.',
  finish: 'Nomi, ranglari va qaysi qismlar bilan sotilishini belgilang.',
};

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

/** Where in the four stages this door is. An orientation aid only — the
 *  stages are walked with the footer buttons, so there is never a way to
 *  land on one without the one before it being settled. */
function Stepper({ stage }: { stage: Stage }) {
  const at = STAGES.findIndex((s) => s.id === stage);
  return (
    <div style={{ display: 'flex', gap: 4, margin: '12px 0 10px' }}>
      {STAGES.map((s, i) => {
        const now = i === at;
        return (
          <div key={s.id} style={{ flex: 1, minWidth: 0 }}>
            <div style={{ height: 3, borderRadius: 2, background: now ? COLOR.brass : i < at ? 'rgba(143,113,69,.45)' : COLOR.line }} />
            <div style={{ marginTop: 5, fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: now ? COLOR.ink : COLOR.inkSoft, fontWeight: now ? 600 : 400 }}>
              {i + 1}. {s.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

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
  /** Swap the tracing photo for the cut-out result — see `maskedPreview`. */
  const [showResult, setShowResult] = useState(false);
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

  // Which nalichnik/korona pieces this door comes with — a room's trim is
  // measured once against its own photo, but which of those pieces take
  // paint depends on which door is standing in the doorway. Defaults to
  // every role, matching "no restriction" for a door that hasn't set this.
  const [trimRoles, setTrimRoles] = useState<Set<TrimRole>>(() => new Set(DOOR_TRIM_ROLES));
  const toggleTrimRole = (role: TrimRole) =>
    setTrimRoles((s) => {
      const next = new Set(s);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });

  // A door is often PHOTOGRAPHED already standing in a good casing — the
  // SAME photo can double as a nalichnik/korona shoot instead of a separate
  // one. Whatever gets traced here is never stored on the door itself —
  // it's published straight to the shared catalog (see `publish()`), split
  // by role into its own nalichnik entry and/or its own korona entry,
  // exactly like tracing them directly in TrimBench would.
  //
  // Each of those is cut on its OWN stage rather than all at once on one
  // screen: doing the door, the nalichnik and the korona together made a
  // mistake in any one of them impossible to attribute, since the only
  // feedback was a single published result at the end.
  const [stage, setStage] = useState<Stage>('door');
  const onTrimStage = stage === 'nalichnik' || stage === 'korona';
  /** Fraction of the leaf's own width/height to reveal on every side —
   *  uniform rather than four independent sliders, since a door photographed
   *  square-on shows roughly as much casing on every side. */
  const [margin, setMargin] = useState(0.15);
  const [trim, setTrim] = useState<TrimPieceState[]>([]);
  const [activeTrimId, setActiveTrimId] = useState<string | null>(null);
  const [paddedImg, setPaddedImg] = useState<HTMLImageElement | null>(null);
  // Named on their own stages, so neither has to be derived from a shared
  // name with a suffix bolted on.
  const [nalichnikName, setNalichnikName] = useState('');
  const [koronaName, setKoronaName] = useState('');

  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const trimWrapRef = useRef<HTMLDivElement>(null);
  const trimDrag = useRef<{ trimId: string; loop: 'points' | 'holePoints'; index: number } | null>(null);

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
    setTrimRoles(new Set(edit.trimRoles ?? DOOR_TRIM_ROLES));
    // A door no longer carries its own trim data — reopening one never
    // brings back a previous trace (there's nothing left to bring back;
    // whatever was traced before is out in the catalog under its own id).
    setStage('door');
    setTrim([]);
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
      setStage('door');
      setTrim([]);
      setActiveTrimId(null);
      setNalichnikName('');
      setKoronaName('');
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

  const marginObj: Margin = { left: margin, right: margin, top: margin, bottom: margin };
  /** Where the leaf itself sits within the padded canvas, as fractions of
   *  THAT canvas — what a fresh trim piece is measured against, the same
   *  way a room's trim is measured against its doorway. */
  const paddedFrac = 1 + margin * 2;
  const leafRef = { x: margin / paddedFrac, y: margin / paddedFrac, w: 1 / paddedFrac, h: 1 / paddedFrac };

  /** A live, low-res look at the padded/rectified crop trim gets traced
   *  on — the exact flattening the leaf itself gets, just extended past its
   *  own edges by `margin` so whatever casing the photo shows around the
   *  door becomes visible to mark. Only runs while tracing is actually on;
   *  a door that doesn't use this feature pays nothing for it. */
  useEffect(() => {
    if (!onTrimStage || !img || corners.length !== 4) { setPaddedImg(null); return; }
    let live = true;
    const t = window.setTimeout(() => {
      try {
        const c = rectify(img, corners as [Pt, Pt, Pt, Pt], 500, marginObj);
        const el = new Image();
        el.onload = () => { if (live) setPaddedImg(el); };
        // Alpha-preserving, so what gets traced on is what gets published —
        // a JPEG here painted the un-photographed margin solid black and the
        // trace was made against a lie.
        el.src = encodeAlpha(c, 0.85);
      } catch { /* a degenerate quad mid-drag — ignore, the next frame recovers */ }
    }, 120);
    return () => { live = false; window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onTrimStage, img, corners, margin]);

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
    // The crown spans the whole opening, so it is measured off the leaf
    // itself — not off a shaft piece, which is now only ever one narrow side
    // strip and would have given a korona the width of one casing.
    const rect =
      role === 'crown'
        ? { x: leafRef.x * 0.1, y: leafRef.y * 0.1, w: 1 - leafRef.x * 0.2, h: leafRef.y * 0.95 }
        : defaultRectFor(role, leafRef, trim);
    const label = role === 'extra' ? `Boshqa ${trim.filter((t) => t.role === 'extra').length + 1}` : undefined;
    setTrim((ts) => [...ts, { id, role, label, rect, points: seedPoints(rect) }]);
    setActiveTrimId(id);
  };
  /** One side's strip, added (or re-added after a delete) on its own. */
  const addNalichnikSide = (side: (typeof NALICHNIK_SIDES)[number]) => {
    const rect = sideStrip(side.id === 'shaft-left' ? 'left' : 'right', leafRef);
    setTrim((ts) => [...ts, { id: side.id, role: 'shaft' as TrimRole, label: side.label, rect, points: seedPoints(rect) }]);
    setActiveTrimId(side.id);
  };
  const removeTrimPiece = (id: string) => {
    setTrim((ts) => ts.filter((t) => t.id !== id));
    setActiveTrimId((a) => (a === id ? null : a));
  };
  const toggleTrimHole = (trimId: string) => {
    setTrim((ts) => ts.map((t) => (t.id === trimId ? { ...t, holePoints: t.holePoints ? undefined : seedPoints(leafRef) } : t)));
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
    // A middle-click-drag pan (the browser's own autoscroll gesture, the
    // only way to move around a canvas zoomed in past the viewport) must
    // reach the scrollable container untouched — only the primary button
    // adds a point here.
    if (e.button > 0) return;
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

  /** An optional, full-resolution "is this really right?" look, shown inline
   *  below the live preview — publish() itself always renders at full
   *  quality regardless, so this is reassurance, not a required step. */
  /** Move between stages. Always lands on the drawing view rather than the
   *  cut-out, and selects whatever piece that stage already owns, so a stage
   *  opens ready to work instead of showing the previous one's leftovers. */
  const goStage = (next: Stage) => {
    setStage(next);
    setShowResult(false);
    const roles: TrimRole[] =
      next === 'nalichnik' ? [...STAGE_ROLES.nalichnik, 'extra'] : next === 'korona' ? STAGE_ROLES.korona : [];
    // The nalichnik is always the two side strips, so the stage opens with
    // both already laid down the sides — there is no other shape to choose,
    // and starting from them is what keeps the top band and the wall out.
    if (next === 'nalichnik' && !trim.some((t) => roles.includes(t.role))) {
      // How far out the photo can be opened is measured from the photo
      // itself, not left on a slider for someone to guess — and it has to
      // settle BEFORE the strips are laid, since they are placed inside
      // whatever it reveals.
      const m = img && corners.length === 4 ? fitMargin(img, corners as [Pt, Pt, Pt, Pt]) : margin;
      setMargin(m);
      const pad = 1 + m * 2;
      const ref = { x: m / pad, y: m / pad, w: 1 / pad, h: 1 / pad };
      const seeded = NALICHNIK_SIDES.map((s) => {
        const rect = sideStrip(s.id === 'shaft-left' ? 'left' : 'right', ref);
        return { id: s.id, role: 'shaft' as TrimRole, label: s.label, rect, points: seedPoints(rect) };
      });
      setTrim((ts) => [...ts, ...seeded]);
      setActiveTrimId(seeded[0].id);
      return;
    }
    setActiveTrimId(trim.find((t) => roles.includes(t.role))?.id ?? null);
  };

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
    try {
      publishNow();
    } catch (err) {
      // Anything thrown in here used to leave the button reading
      // "Saqlanmoqda…" for good, with no way to tell what had gone wrong —
      // and a full storage drawer, which is what a shelf of photographs
      // eventually causes, throws exactly here.
      setBusy(false);
      toast(err instanceof Error && err.message === STORAGE_FULL
        ? 'Xotira to‘lgan — eski nalichnik/korona yoki eshiklarni o‘chiring'
        : 'Saqlashda xatolik — qaytadan urinib ko‘ring');
      return;
    }
    setBusy(false);
    toast('Saqlandi ✓');
    onDone();
  };

  const publishNow = () => {
    if (!img || corners.length !== 4) return;
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
      // Same "all selected = no restriction" convention as colorIds — a door
      // that comes with every role a room might have (the common case)
      // saves as undefined, not a frozen list that would silently exclude a
      // role added to the standard set later.
      trimRoles: trimRoles.size === DOOR_TRIM_ROLES.length ? undefined : [...trimRoles],
    });

    // Whatever was traced above is never stored on the door — it goes
    // straight to the shared catalog, split by role into up to two entries,
    // same as tracing them directly in TrimBench would. Both share the SAME
    // padded rectify (one photo, one margin); only which pieces go in each
    // differs.
    if (trim.length > 0) {
      const tc = rectify(img, corners as [Pt, Pt, Pt, Pt], 1200, marginObj);
      // 600, not 1000: the renderer downsamples every casing to CASING_W
      // (512) before it does anything, so the extra pixels were only ever
      // spending the storage budget that later refused a save outright.
      const tscale = Math.min(1, 600 / tc.width);
      const tsmall = document.createElement('canvas');
      tsmall.width = Math.round(tc.width * tscale);
      tsmall.height = Math.round(tc.height * tscale);
      tsmall.getContext('2d')!.drawImage(tc, 0, 0, tsmall.width, tsmall.height);
      const trimSource = encodeAlpha(tsmall, 0.85);
      const trimCorners = corners.map((c) => ({ x: +(c.x / img.width).toFixed(4), y: +(c.y / img.height).toFixed(4) }));

      const nalichnikPieces = trim.filter((t) => NALICHNIK_ROLES.includes(t.role));
      const koronaPieces = trim.filter((t) => t.role === 'crown');

      const publishCategory = (category: 'nalichnik' | 'korona', pieces: TrimPieceState[]) => {
        if (!pieces.length) return;
        const label = category === 'nalichnik' ? 'Nalichnik' : 'Korona';
        const name = (category === 'nalichnik' ? nalichnikName : koronaName).trim() || label;
        const catalogTrim: AdminTrim = {
          id: 'a-' + Date.now().toString(36) + '-' + category,
          name: { uz: name, kk: name, ru: name },
          category,
          trimMargin: marginObj,
          trimBoxes: pieces.map(toStoredTrim),
          trimSource,
          createdAt: Date.now(),
          source: source ?? edit?.source,
          corners: trimCorners,
        };
        saveTrimModel(catalogTrim);
      };
      publishCategory('nalichnik', nalichnikPieces);
      publishCategory('korona', koronaPieces);
    }
  };

  const dispW = img ? img.width * zoom : 0;
  const dispH = img ? img.height * zoom : 0;
  const activeTrim = trim.find((t) => t.id === activeTrimId) ?? null;
  const trimStage = stage === 'nalichnik' || stage === 'korona' ? stage : null;
  /** Only the pieces this stage owns. Each stage is cut, judged and named on
   *  its own, so the nalichnik's pieces must never appear while the korona is
   *  being worked on — that mixing is what made a bad trace impossible to
   *  attribute to one or the other. */
  const stagePieces = trimStage ? trim.filter((t) => STAGE_ROLES[trimStage].includes(t.role) || (trimStage === 'nalichnik' && t.role === 'extra')) : [];
  // On a trim stage the studio shows the padded, flattened crop the trim is
  // traced against instead of the raw photo.
  const showTrimStudio = !!trimStage && !!paddedImg;

  // Exactly what the client will receive from THIS stage: its own traced
  // pieces cut out of the padded photo, everything else gone. Drawn by the
  // SAME masking the stage runs, so it cannot flatter the trace. Without
  // this the bench only ever showed the outline, and a rectangle stretched
  // out to the crown's width quietly took the wall beside the casing with
  // it — which then landed on the room photo as a band of that wall's colour.
  // The door's own rect is punched back out: the leaf image covers exactly
  // that on the stage, so anything traced there can never be seen, and
  // leaving it in showed a whole door where the point is to judge the thin
  // ring around it. What's left is precisely what reaches the customer.
  const maskedPreview = useRender(
    () => (showResult && paddedImg && stagePieces.length ? maskTrim(`bench-${stage}`, paddedImg.src, stagePieces.map(toStoredTrim), leafRef) : Promise.resolve(null)),
    '',
    [showResult, paddedImg, stagePieces, stage, margin]
  );
  const tDispW = paddedImg ? paddedImg.width * zoom : 0;
  const tDispH = paddedImg ? paddedImg.height * zoom : 0;

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
        {img && !onTrimStage && (
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
            style={{
              position: 'relative', width: tDispW, height: tDispH, flexShrink: 0, touchAction: 'none',
              // A checker behind the cut-out, so "nothing here" reads as empty
              // rather than as a colour the trim actually has.
              ...(showResult
                ? {
                    backgroundImage:
                      'linear-gradient(45deg,#e6e2da 25%,transparent 25%),linear-gradient(-45deg,#e6e2da 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e6e2da 75%),linear-gradient(-45deg,transparent 75%,#e6e2da 75%)',
                    backgroundSize: '16px 16px',
                    backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
                    backgroundColor: '#fff',
                  }
                : null),
            }}
            onPointerMove={showResult || !activeTrim ? undefined : onTrimMove}
            onPointerUp={showResult || !activeTrim ? undefined : () => (trimDrag.current = null)}
            onPointerDown={showResult || !activeTrim ? undefined : onTrimAddPoint}
          >
            {/* Nothing at all while the cut-out is still being computed —
                an empty src would have the browser refetch the page. */}
            {(!showResult || maskedPreview) && (
              <img
                src={showResult ? maskedPreview : paddedImg!.src}
                alt=""
                draggable={false}
                style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none' }}
              />
            )}
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              {/* The leaf's own extent within the padded canvas — a fixed
                  reference so it's clear where the door itself ends and the
                  revealed casing begins. */}
              {/* Kept visible in the cut-out view too: inside it the door's
                  own image covers the trim, so only what falls OUTSIDE this
                  box is what the customer actually ends up seeing. */}
              <rect x={leafRef.x * tDispW} y={leafRef.y * tDispH} width={leafRef.w * tDispW} height={leafRef.h * tDispH} fill="none" stroke={COLOR.lineStrong} strokeDasharray="5 4" strokeWidth={1.5} />
              {!showResult && activeTrim && (
                <polygon
                  points={activeTrim.points.map((p) => `${p.x * tDispW},${p.y * tDispH}`).join(' ')}
                  fill="rgba(35,32,27,.15)"
                  stroke={ROLE_META[activeTrim.role].color}
                  strokeWidth={2}
                />
              )}
              {!showResult && activeTrim?.holePoints && (
                <polygon
                  points={activeTrim.holePoints.map((p) => `${p.x * tDispW},${p.y * tDispH}`).join(' ')}
                  fill="rgba(255,255,255,.28)"
                  stroke={ROLE_META[activeTrim.role].color}
                  strokeWidth={2}
                  strokeDasharray="6 5"
                />
              )}
            </svg>
            {!showResult && activeTrim?.points.map((p, i) => (
              <Handle
                key={`o${i}`}
                x={p.x * tDispW}
                y={p.y * tDispH}
                color={ROLE_META[activeTrim.role].color}
                onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture(e.pointerId); trimDrag.current = { trimId: activeTrim.id, loop: 'points', index: i }; }}
                onDoubleClick={() => removeTrimPoint(activeTrim.id, 'points', i)}
              />
            ))}
            {!showResult && activeTrim?.holePoints?.map((p, i) => (
              <Handle
                key={`h${i}`}
                x={p.x * tDispW}
                y={p.y * tDispH}
                color={ROLE_META[activeTrim.role].color}
                onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture(e.pointerId); trimDrag.current = { trimId: activeTrim.id, loop: 'holePoints', index: i }; }}
                onDoubleClick={() => removeTrimPoint(activeTrim.id, 'holePoints', i)}
              />
            ))}
          </div>
        )}
      </div>

      <Panel>
        <PanelBody>
          <div style={{ ...TYPE.h2, color: COLOR.ink, margin: '0 0 4px' }}>{edit ? 'Eshikni tahrirlash' : 'Yangi eshik'}</div>
          {!img && <div style={{ ...TYPE.small, color: COLOR.inkSoft }}>Boshlash uchun eshik rasmini yuklang.</div>}
          {img && (
            <>
              <Stepper stage={stage} />
              <div style={{ ...TYPE.small, color: COLOR.inkSoft }}>{STAGE_HINT[stage]}</div>

              {stage === 'door' && (
                <>
                  {/* live result — updates as the corners move, so a bad mark is seen at once */}
                  <Label>Jonli ko‘rinish</Label>
                  <div style={{ display: 'flex', justifyContent: 'center', background: COLOR.paper, border: `1px solid ${COLOR.line}`, borderRadius: RADIUS, padding: 10, minHeight: 150 }}>
                    {live ? <img src={live} alt="" style={{ maxHeight: 240, borderRadius: RADIUS_SM }} /> : <span style={{ color: COLOR.inkSoft, fontSize: 12, alignSelf: 'center' }}>burchaklarni sozlang…</span>}
                  </div>
                </>
              )}

              {stage === 'finish' && (
              <>
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

              <Section title="Nalichnik va korona — bu eshik qaysi qismlar bilan sotiladi">
                <div style={{ fontSize: 12, color: COLOR.inkSoft, lineHeight: 1.5, marginBottom: 10 }}>
                  Xonaning nalichnigi bir marta o‘lchanadi, lekin har eshik uning
                  qaysi qismini olib keladi — bu shu yerda belgilanadi. Masalan
                  zamonaviy eshik faqat <b>Nalichnik</b>ni olib kelishi, Korona va
                  oyoqlarsiz sotilishi mumkin.
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {DOOR_TRIM_ROLES.map((role) => {
                    const on = trimRoles.has(role);
                    const meta = ROLE_META[role];
                    return (
                      <button
                        key={role}
                        onClick={() => toggleTrimRole(role)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 7, minHeight: TOUCH_MIN, padding: '6px 14px 6px 8px', borderRadius: 999, fontFamily: 'inherit',
                          border: `1px solid ${on ? meta.color : COLOR.lineStrong}`, background: on ? 'rgba(143,113,69,.1)' : '#fff',
                          color: COLOR.ink, fontSize: 13, cursor: 'pointer',
                        }}
                      >
                        <span style={{ width: 11, height: 11, borderRadius: 999, background: meta.color, flex: '0 0 auto' }} />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
                {trimRoles.size === 0 && (
                  <div style={{ fontSize: 12, color: DANGER.text, marginTop: 8 }}>
                    Birorta qism belgilanmagan — bu eshik hech qanday nalichnik/korona bilan ko‘rinmaydi.
                  </div>
                )}
              </Section>
              </>
              )}

              {onTrimStage && (
                  <>
                    <Label>Atrofni ochish — {(margin * 100).toFixed(0)}% (avtomatik)</Label>
                    <input type="range" min={0.03} max={0.4} step={0.01} value={margin} onChange={(e) => setMargin(+e.target.value)} style={{ width: '100%' }} />
                    <div style={{ fontSize: 12, color: COLOR.inkSoft, lineHeight: 1.5, marginTop: 6 }}>
                      Suratda eshik atrofida qancha joy borligiga qarab o‘zi
                      topildi — odatda tegish shart emas. Nalichnik sig‘masa
                      kengaytiring.
                    </div>

                    {/* Only this stage's own pieces — the korona stage must not
                        offer a side strip, or the two would mix again. */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                      {stage === 'nalichnik'
                        ? NALICHNIK_SIDES.map((s) => (
                            <RoleChip
                              key={s.id}
                              label={s.label}
                              color={ROLE_META.shaft.color}
                              disabled={trim.some((t) => t.id === s.id)}
                              onClick={() => addNalichnikSide(s)}
                            />
                          ))
                        : STAGE_ROLES.korona.map((role) => (
                            <RoleChip key={role} label={ROLE_META[role].label} color={ROLE_META[role].color} disabled={trim.some((t) => t.role === role)} onClick={() => addTrimPiece(role)} />
                          ))}
                      {stage === 'nalichnik' && <RoleChip label="Boshqa" color={ROLE_META.extra.color} onClick={() => addTrimPiece('extra')} />}
                    </div>

                    {stagePieces.length > 0 && (
                      <>
                        <button
                          onClick={() => setShowResult((v) => !v)}
                          style={{
                            marginTop: 10, minHeight: TOUCH_MIN, width: '100%', borderRadius: RADIUS_SM,
                            border: `1px solid ${showResult ? COLOR.brass : COLOR.lineStrong}`,
                            background: showResult ? 'rgba(143,113,69,.1)' : '#fff',
                            color: COLOR.ink, fontSize: 13, cursor: 'pointer',
                          }}
                        >
                          {showResult ? '← Chizishga qaytish' : 'Kesilgan natijani ko‘rish'}
                        </button>
                        <div style={{ fontSize: 12, color: COLOR.inkSoft, lineHeight: 1.5, marginTop: 6 }}>
                          Mijoz ekraniga aynan shu tushadi; kataklar — bo‘sh joy.
                          Eshikning o‘rni ham bo‘sh: uni eshik rasmi yopadi.
                          {stage === 'korona'
                            ? ' Ya’ni faqat eshik tepasidagi korona qolishi kerak.'
                            : ' Ya’ni faqat ikki yondagi nalichnik tasmalari qolishi kerak.'}
                          {' '}Kesimga eshik atrofidagi devor ham tushib qolgan
                          bo‘lsa, o‘sha devor xona rasmiga ham chiqadi.
                        </div>
                      </>
                    )}

                    <div style={{ marginTop: 10 }}>
                      {stagePieces.map((t) => {
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
                                <span style={{ flex: 1, fontSize: 13, color: COLOR.ink }}>{t.label ?? meta.label}</span>
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

                                {/* A korona is a solid moulding sitting above the
                                    door — it has no hole through it, so the
                                    option is not offered there at all. */}
                                {stage !== 'korona' && (
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: TOUCH_MIN, marginTop: 6, fontSize: 12, color: COLOR.ink, cursor: 'pointer' }}>
                                    <input type="checkbox" checked={!!t.holePoints} onChange={() => toggleTrimHole(t.id)} />
                                    Ichki chegarani ham (qo‘lda) belgilash
                                  </label>
                                )}

                                <div style={{ marginTop: 8 }}>
                                  <MoveResize onMove={(dx, dy) => nudgeTrimPiece(t.id, dx, dy)} onSize={() => {}} sizeless />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {stagePieces.length === 0 ? (
                      <div style={{ fontSize: 12, color: COLOR.inkSoft, marginTop: 8, lineHeight: 1.5 }}>
                        Hali hech narsa chizilmagan. Bu eshikda {stage === 'korona' ? 'korona' : 'nalichnik'} bo‘lmasa,
                        pastdagi «O‘tkazib yuborish» tugmasini bosing.
                      </div>
                    ) : (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${COLOR.line}` }}>
                        <Label>Dizayn nomi</Label>
                        <input
                          value={stage === 'korona' ? koronaName : nalichnikName}
                          onChange={(e) => (stage === 'korona' ? setKoronaName(e.target.value) : setNalichnikName(e.target.value))}
                          style={inp}
                          placeholder={stage === 'korona' ? 'Masalan: Klassik oq korona' : 'Masalan: Klassik oq nalichnik'}
                        />
                      </div>
                    )}
                  </>
                )}

              {stage !== 'finish' && (
                <Section title="Joylashuv">
                  <Label>Kattalashtirish — {(zoom * 100).toFixed(0)}%</Label>
                  {/* Also drives the trim studio's own zoom (see tDispW/tDispH
                      above) — dense, ornate trim needs room on screen to place
                      close points without adjacent 44px handles overlapping. */}
                  <input type="range" min={0.08} max={8} step={0.02} value={zoom} onChange={(e) => setZoom(+e.target.value)} style={{ width: '100%' }} />
                  {stage === 'door' && (
                    <>
                      <Label>Burchakni aniqlash</Label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {corners.map((_, i) => (
                          <div key={i} style={{ background: '#fff', border: `1px solid ${COLOR.line}`, borderRadius: RADIUS, padding: 8 }}>
                            <div style={{ fontSize: 11, color: COLOR.inkSoft, marginBottom: 5 }}>{LABELS[i]}</div>
                            <Pad onNudge={(dx, dy) => nudge(i, dx, dy)} />
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </Section>
              )}

              {stage === 'finish' && result && (
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
            {/* One stage, one decision: go back, move on, or — only at the
                end — publish. The quality check belongs with publishing, not
                beside the tracing it says nothing about. */}
            <div style={{ display: 'flex', gap: 8 }}>
              {stage !== 'door' && (
                <AdminGhostButton onClick={() => goStage(STAGES[STAGES.findIndex((s) => s.id === stage) - 1].id)} style={{ flex: '0 0 auto', width: 'auto', padding: '0 16px' }}>
                  ← Orqaga
                </AdminGhostButton>
              )}
              {stage === 'door' && (
                <AdminPrimaryButton onClick={() => goStage('nalichnik')} disabled={!live} style={{ flex: 1 }}>
                  Davom etish →
                </AdminPrimaryButton>
              )}
              {onTrimStage && (
                <AdminPrimaryButton onClick={() => goStage(stage === 'nalichnik' ? 'korona' : 'finish')} style={{ flex: 1 }}>
                  {stagePieces.length === 0 ? 'O‘tkazib yuborish →' : 'Davom etish →'}
                </AdminPrimaryButton>
              )}
              {stage === 'finish' && (
                <>
                  <AdminGhostButton onClick={check} disabled={checking} style={{ flex: 1 }}>
                    {checking ? 'Ishlanmoqda…' : 'Sifatni tekshirish'}
                  </AdminGhostButton>
                  <AdminPrimaryButton onClick={publish} disabled={!live || busy} style={{ flex: 1 }}>
                    {busy ? 'Saqlanmoqda…' : 'Qo‘shish ✓'}
                  </AdminPrimaryButton>
                </>
              )}
            </div>
          </PanelFooter>
        )}
      </Panel>
    </div>
  );
}
