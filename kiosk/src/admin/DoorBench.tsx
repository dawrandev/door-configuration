import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COLOR, RADIUS, RADIUS_SM, TOUCH_MIN, TYPE } from '../design/tokens';
import { rectify, stripHandle, neutraliseWhite, encodeAlpha, looksWhite, photoMargin, type Pt, type Margin } from './rectify';
import {
  publishLeaf, addColor as addColorApi, getAdminCatalog, dataUrlToBlob,
  type AdminLeaf, type AdminTrim, type LeafPayload,
} from '../api/catalog';
import { ApiError } from '../api/http';
import type { DoorColor } from '../catalog/colors';
import {
  Panel, PanelBody, PanelFooter, Label, Section, inp, AdminPrimaryButton, AdminGhostButton, Seg, Pad, Handle, DANGER, useToast, ROLE_ORDER, ROLE_META, RoleChip, MoveResize, TRACE, TraceShape, Loupe,
} from './adminKit';
import { bboxOfPoints, seedPoints, defaultRectFor, nearestLoop, insertIndexForPoint, toStoredTrim, toTrimState, type Point, type TrimPieceState } from './trimGeometry';
import { maskTrim, useRender } from '../render/recolor';
import type { TrimPiece, TrimRole } from '../catalog/types';

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
type Stage = 'door' | 'shape' | 'nalichnik' | 'korona' | 'finish';
const STAGES: { id: Stage; label: string }[] = [
  { id: 'door', label: 'Eshik' },
  { id: 'shape', label: 'Shakl' },
  { id: 'nalichnik', label: 'Nalichnik' },
  { id: 'korona', label: 'Korona' },
  { id: 'finish', label: 'Yakunlash' },
];

/**
 * The silhouette a door starts with: its whole rectangle.
 *
 * Kept as the yardstick rather than a boolean flag, so "has the operator
 * actually shaped this door?" is answered by comparing against it. A door left
 * alone, or dragged and dragged back, publishes `shape: null` and stays the
 * opaque rectangle it has always been.
 */
const FULL_RECT: Point[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
const isFullRect = (pts: Point[]) =>
  pts.length === FULL_RECT.length &&
  pts.every((p, i) => Math.abs(p.x - FULL_RECT[i].x) < 1e-6 && Math.abs(p.y - FULL_RECT[i].y) < 1e-6);

/** Clip a canvas to the traced silhouette, leaving everything outside it
 *  transparent. `destination-in` keeps the pixels the new shape covers. */
function clipToShape(c: HTMLCanvasElement, shape: Point[]): void {
  const ctx = c.getContext('2d')!;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.beginPath();
  shape.forEach((p, i) => (i ? ctx.lineTo(p.x * c.width, p.y * c.height) : ctx.moveTo(p.x * c.width, p.y * c.height)));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
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
 * A starting strip down one side of the door.
 *
 * Sized off the DOOR, not off however much photo happens to surround it: a
 * real 70-100mm casing on an 800mm leaf is about a tenth of the door's own
 * width, and that is true whatever the photograph shows. Taking it from the
 * reveal instead is what once seeded strips four times too fat the moment the
 * reveal stopped being a fixed number.
 */
const CASING_OF_DOOR = 0.10;
function sideStrip(side: 'left' | 'right', ref: { x: number; y: number; w: number; h: number }) {
  const w = Math.min(ref.w * CASING_OF_DOOR, 0.45);
  const x = side === 'left' ? ref.x - w * 0.9 : ref.x + ref.w - w * 0.1;
  // A little past the leaf's foot, where the plinth block sits.
  const h = Math.min(ref.h * 1.06, 1 - ref.y);
  return { x: Math.max(0, Math.min(1 - w, x)), y: ref.y, w, h };
}
/**
 * Stored boxes back into editable outlines, with the ids this bench works in.
 *
 * `toStoredTrim` keeps a piece's role, label and points but not its id, and
 * here the id is semantic: the side chips and the auto-seeding check both key
 * off `shaft-left` / `shaft-right`. A stored label names the side when the
 * piece came from this bench; otherwise the side is read off the box's own
 * centre, which works at any margin because the leaf's centre sits at exactly
 * 0.5 of the padded canvas — `(m + 0.5) / (1 + 2m) = 0.5`.
 */
function restorePieces(boxes: TrimPiece[] | undefined): TrimPieceState[] {
  if (!boxes?.length) return [];
  const used = new Set<string>();
  return boxes.map((b, i) => {
    let id: string;
    let label = b.label;
    if (b.role === 'crown') {
      id = 'crown';
    } else if (b.role === 'shaft') {
      const named = NALICHNIK_SIDES.find((s) => s.label === b.label);
      const side = named ?? (b.x + b.w / 2 < 0.5 ? NALICHNIK_SIDES[0] : NALICHNIK_SIDES[1]);
      id = side.id;
      label = side.label;
    } else if (!b.role || b.role === 'extra') {
      id = `extra-${i}`;
      label = b.label ?? `Boshqa ${i + 1}`;
    } else {
      id = b.role;
    }
    // Two pieces sharing an id would drag together, since every edit maps
    // over `trim` by id.
    while (used.has(id)) id += '-2';
    used.add(id);
    return toTrimState(id, b, b.role ?? 'extra', label);
  });
}

/**
 * The same outlines, re-expressed against a different reveal.
 *
 * Pieces are stored as fractions of the PADDED canvas, but the reveal is now
 * measured from the photograph — so nudging a corner moves the canvas out
 * from under a saved trace. Converting through leaf units (0 = the leaf's own
 * left edge, 1 = its right) anchors every outline to the DOOR, which is what
 * it was traced against in the first place.
 */
function remapPieces(pieces: TrimPieceState[], from: Margin, to: Margin): TrimPieceState[] {
  const fw = 1 + from.left + from.right, fh = 1 + from.top + from.bottom;
  const tw = 1 + to.left + to.right, th = 1 + to.top + to.bottom;
  if (Math.abs(fw - tw) < 1e-6 && Math.abs(fh - th) < 1e-6 && Math.abs(from.left - to.left) < 1e-6 && Math.abs(from.top - to.top) < 1e-6) return pieces;
  const mx = (x: number) => (x * fw - from.left + to.left) / tw;
  const my = (y: number) => (y * fh - from.top + to.top) / th;
  const pts = (ps: { x: number; y: number }[]) => ps.map((q) => ({ x: mx(q.x), y: my(q.y) }));
  return pieces.map((t) => {
    const points = pts(t.points);
    return { ...t, points, holePoints: t.holePoints && pts(t.holePoints), rect: bboxOfPoints(points) };
  });
}

const STAGE_HINT: Record<Stage, string> = {
  door: 'Eshik yuzasining 4 burchagini belgilang — ramkani emas, tavaqani.',
  shape: 'Eshik to‘g‘ri to‘rtburchak bo‘lmasa — masalan tepasi kamarli bo‘lsa — chetini shu yerda chizing. Chiziq ustiga bosib nuqta qo‘shiladi, nuqtaga ikki marta bosib o‘chiriladi. To‘rtburchak bo‘lsa, o‘tkazib yuboring.',
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

/**
 * Where in the stages this door is, and how to jump between them.
 *
 * Every step is clickable once there is a door to work on — reopening to fix
 * one thing should not mean walking the whole sequence to reach it. The labels
 * carry a dotted underline so that reads as an offer rather than a caption;
 * they looked like plain text and were being treated as one.
 */
function Stepper({ stage, onGo, enabled }: { stage: Stage; onGo: (s: Stage) => void; enabled: boolean }) {
  const at = STAGES.findIndex((s) => s.id === stage);
  return (
    <div style={{ display: 'flex', gap: 4, margin: '12px 0 10px' }}>
      {STAGES.map((s, i) => {
        const now = i === at;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => { if (enabled && !now) onGo(s.id); }}
            disabled={!enabled || now}
            style={{
              flex: 1, minWidth: 0, textAlign: 'left', padding: 0, border: 'none', background: 'none',
              fontFamily: 'inherit', cursor: enabled && !now ? 'pointer' : 'default',
            }}
          >
            <div style={{ height: 3, borderRadius: 2, background: now ? COLOR.brass : i < at ? 'rgba(143,113,69,.45)' : COLOR.line }} />
            <div
              style={{
                marginTop: 5, fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                color: now ? COLOR.ink : COLOR.inkSoft, fontWeight: now ? 600 : 400,
                textDecoration: enabled && !now ? 'underline dotted' : 'none',
                textUnderlineOffset: 3,
              }}
            >
              {i + 1}. {s.label}
            </div>
          </button>
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
  // Paints live on the server now, so the list arrives with the catalogue
  // rather than being merged out of this browser. 'oq' is the photograph
  // itself, never a paint anyone picks.
  const [colors, setColors] = useState<DoorColor[]>([]);
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
  /** The door's own outline, in fractions of the RECTIFIED leaf — the space
   *  the four corners define, so nudging a corner leaves it in place. */
  const [shape, setShape] = useState<Point[]>(FULL_RECT);
  /** The rectified leaf, which is what the outline is traced on. Not the
   *  padded canvas the trim stages use: a door's own edge is the edge of the
   *  door, and the surround has nothing to do with it. */
  const [shapeImg, setShapeImg] = useState<HTMLImageElement | null>(null);
  const [shapeLens, setShapeLens] = useState<{ x: number; y: number } | null>(null);
  const shapeDrag = useRef<number | null>(null);
  /** Fraction of the leaf's own width/height to reveal on every side —
   *  uniform rather than four independent sliders, since a door photographed
   *  square-on shows roughly as much casing on every side. */
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
  /** Where each stage's loupe looks, in that stage's own display pixels. State
   *  rather than a ref: the magnifier has to re-render as the point moves,
   *  while the drag refs above deliberately do not re-render on a press. */
  const [lens, setLens] = useState<{ x: number; y: number } | null>(null);
  const [trimLens, setTrimLens] = useState<{ x: number; y: number } | null>(null);

  /**
   * Reopen a saved door for adjustment. Its settings come back always; its
   * source and marks come back too when they were stored (doors added since the
   * source feature). A door saved before that has no source, so the bench keeps
   * the name and options but asks for the photo again — and republishes under
   * the same id, so it is edited, not duplicated.
   *
   * oxlint wants `colors` in the dependency list. Adding it would be a
   * regression, not a fix: `addColor` calls setColors, which would re-run this
   * whole effect and reset the name, the stage and every traced piece — so
   * registering a new paint would wipe the form out from under the operator
   * mid-edit. `colors` is read once here to seed the default selection and is
   * deliberately a snapshot at reopen time.
   */
  /** This door's already-published designs, so reopening can restore them. */
  const [doorTrims, setDoorTrims] = useState<AdminTrim[]>([]);

  /**
   * Paints and this door's designs, read once from the bench catalogue. They
   * live on the server now, so neither can be merged out of this browser.
   */
  /**
   * Whether this door's own designs have arrived yet.
   *
   * The restore below MUST NOT run before they have. It used to run twice —
   * once against an empty `doorTrims`, then again when the fetch landed — and
   * the second run calls setStage('door'), setTrim(...) and setName(...). On
   * localhost that window is a few milliseconds and invisible. Over a real
   * network it is long enough to open the nalichnik stage, which seeds the two
   * default strips because nothing has been restored yet; the late restore
   * then throws that away, or the operator publishes the seeded defaults over
   * the outlines they actually cut. Either way the tracing is lost.
   */
  const [trimsReady, setTrimsReady] = useState(!edit);
  /** True until a reopened door is fully in the form. Nothing is editable
   *  before then, because until then it is not this door's state. */
  const [loadingEdit, setLoadingEdit] = useState(!!edit);

  useEffect(() => {
    let live = true;
    setTrimsReady(!edit);
    void (async () => {
      try {
        const cat = await getAdminCatalog();
        if (!live || !cat) return;
        const paints = cat.colors.filter((c) => c.id !== 'oq');
        setColors(paints);
        setSelected((sel) => (sel.size ? sel : new Set(paints.map((c) => c.id))));
        setDoorTrims(edit ? cat.trims.filter((t) => t.ownerLeafId === edit.id) : []);
      } catch {
        // The bench shell already reports a catalogue it cannot read; failing
        // again here would just stack two messages for one cause.
      } finally {
        // Even on failure: a catalogue that cannot be read must not leave the
        // bench stuck on "Yuklanmoqda…" with no way forward.
        if (live) setTrimsReady(true);
      }
    })();
    return () => { live = false; };
  }, [edit]);

  useEffect(() => {
    if (!edit || !trimsReady) return;
    setName(edit.name.uz);
    setWhite(edit.white ?? true);
    setSelected(new Set(edit.colorIds ?? colors.map((c) => c.id)));
    setTrimRoles(new Set(edit.trimRoles ?? DOOR_TRIM_ROLES));
    // Absent means the door is a plain rectangle, which is what FULL_RECT is —
    // so a door cut before outlines existed opens on the same shape it has.
    setShape(edit.shape?.length ? edit.shape : FULL_RECT);
    setStage('door');

    // What this door traced last time, back as editable outlines. The backend
    // records which door each design came from, so there is no id convention
    // to keep in step — and reopening is meant to be a nudge, not a re-trace
    // from nothing.
    const nal = doorTrims.find((t) => t.category === 'nalichnik');
    const kor = doorTrims.find((t) => t.category === 'korona');
    const stored = [...restorePieces(nal?.trimBoxes), ...restorePieces(kor?.trimBoxes)];
    setTrim([]);
    setActiveTrimId(null);
    setNalichnikName(nal?.name.uz ?? '');
    setKoronaName(kor?.name.uz ?? '');

    // A door with no stored photograph cannot be re-cut at all, so there is
    // nothing further to wait for.
    if (!edit.source) { setLoadingEdit(false); return; }
    const el = new Image();
    el.onerror = () => setLoadingEdit(false);
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
      // Only now is there a photograph to measure the reveal against, so the
      // stored outlines are moved onto it here rather than at a margin that
      // was still zero a moment ago.
      if (stored.length) {
        const quad = (edit.corners?.length === 4
          ? edit.corners.map((c) => ({ x: c.x * el.width, y: c.y * el.height }))
          : [
              { x: el.width * 0.28, y: el.height * 0.12 },
              { x: el.width * 0.72, y: el.height * 0.12 },
              { x: el.width * 0.72, y: el.height * 0.92 },
              { x: el.width * 0.28, y: el.height * 0.92 },
            ]) as [Pt, Pt, Pt, Pt];
        const was = (nal ?? kor)!.trimMargin;
        setTrim(remapPieces(stored, was, photoMargin(el, quad)));
      }
      // Last: everything this door had is now in the form, so it can be edited.
      setLoadingEdit(false);
    };
    el.src = edit.source;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see the docblock: adding `colors` resets the form mid-edit.
  }, [edit, doorTrims, trimsReady]);

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
      // Whether to even the white point is a fact about the door, not a
      // preference: run on a grey or wood one it bleaches the finish away,
      // and the photograph is then gone for good. Read it off the picture.
      try {
        setWhite(looksWhite(rectify(el, [
          { x: el.width * 0.28, y: el.height * 0.12 },
          { x: el.width * 0.72, y: el.height * 0.12 },
          { x: el.width * 0.72, y: el.height * 0.92 },
          { x: el.width * 0.28, y: el.height * 0.92 },
        ], 300)));
      } catch { setWhite(false); }
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
  const addColor = async () => {
    const hex = /^#[0-9a-fA-F]{6}$/.test(newColorHex) ? newColorHex : null;
    if (!hex || !newColorName.trim()) return;
    // Registering a paint is its own write, outside publish, so it needs its
    // own guard: the local list is only extended once the server has actually
    // taken it, or the bench would offer a colour that does not exist and the
    // door would publish a colorIds entry pointing at nothing.
    try {
      const color = await addColorApi({
        id: 'a-' + Date.now().toString(36),
        name: { uz: newColorName, kk: newColorName, ru: newColorName },
        hex,
      });
      if (!color) return;
      setColors((cs) => [...cs, color]);
      setSelected((sel) => new Set(sel).add(color.id));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Rang saqlanmadi — qaytadan urinib ko‘ring');
      return;
    }
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
    const x = Math.max(0, Math.min(img.width, p.x)), y = Math.max(0, Math.min(img.height, p.y));
    setLens({ x: x * zoom, y: y * zoom });
    setCorners((cs) => cs.map((c, i) => (i === drag.current ? { x, y } : c)));
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

  /** How far past the door the photograph actually reaches — measured from
   *  the photograph itself rather than chosen on a slider, so the tracing
   *  canvas is simply the picture that was uploaded. */
  const marginObj: Margin = useMemo(
    () => (img && corners.length === 4 ? photoMargin(img, corners as [Pt, Pt, Pt, Pt]) : { left: 0, right: 0, top: 0, bottom: 0 }),
    [img, corners]
  );
  /** Where the leaf itself sits within the padded canvas, as fractions of
   *  THAT canvas — what a fresh trim piece is measured against, the same
   *  way a room's trim is measured against its doorway. Per side, since the
   *  photo rarely shows as much on the left as on the right. */
  const padW = 1 + marginObj.left + marginObj.right;
  const padH = 1 + marginObj.top + marginObj.bottom;
  const leafRef = { x: marginObj.left / padW, y: marginObj.top / padH, w: 1 / padW, h: 1 / padH };

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
  }, [onTrimStage, img, corners, marginObj]);

  /** The flattened door, which is the surface its own outline is traced on.
   *  No margin: the surround belongs to the trim stages, not to this. */
  useEffect(() => {
    if (stage !== 'shape' || !img || corners.length !== 4) { setShapeImg(null); return; }
    let live = true;
    const t = window.setTimeout(() => {
      try {
        const c = rectify(img, corners as [Pt, Pt, Pt, Pt], 700);
        stripHandle(c, handleSide);
        if (white) neutraliseWhite(c);
        const el = new Image();
        el.onload = () => { if (live) setShapeImg(el); };
        el.src = c.toDataURL('image/jpeg', 0.86);
      } catch { /* a degenerate quad — the next corner change recovers */ }
    }, 120);
    return () => { live = false; window.clearTimeout(t); };
  }, [stage, img, corners, handleSide, white]);

  const shapeWrapRef = useRef<HTMLDivElement>(null);
  const toShapeFrac = useCallback((cx: number, cy: number) => {
    const r = shapeWrapRef.current!.getBoundingClientRect();
    return { x: Math.min(Math.max(0, (cx - r.left) / r.width), 1), y: Math.min(Math.max(0, (cy - r.top) / r.height), 1) };
  }, []);
  const onShapeMove = (e: React.PointerEvent) => {
    if (shapeDrag.current == null) return;
    const p = toShapeFrac(e.clientX, e.clientY);
    setShapeLens({ x: p.x * sDispW, y: p.y * sDispH });
    setShape((pts) => pts.map((pt, i) => (i === shapeDrag.current ? p : pt)));
  };
  /** A press on the outline splits the segment it landed on, exactly as the
   *  trim tracer does — the gesture is the same everywhere it is offered. */
  const onShapeAddPoint = (e: React.PointerEvent) => {
    if (e.button > 0 || shapeDrag.current != null) return;
    const p = toShapeFrac(e.clientX, e.clientY);
    const idx = insertIndexForPoint(shape, p);
    setShape((pts) => [...pts.slice(0, idx), p, ...pts.slice(idx)]);
    (e.target as Element).setPointerCapture(e.pointerId);
    shapeDrag.current = idx;
  };
  /** Three points is the floor: below that the outline encloses nothing and
   *  the mask would erase the whole door. */
  const removeShapePoint = (index: number) =>
    setShape((pts) => (pts.length <= 3 ? pts : pts.filter((_, i) => i !== index)));

  const toTrimFrac = useCallback((cx: number, cy: number) => {
    const r = trimWrapRef.current!.getBoundingClientRect();
    return { x: Math.min(Math.max(0, (cx - r.left) / r.width), 1), y: Math.min(Math.max(0, (cy - r.top) / r.height), 1) };
  }, []);
  const onTrimMove = (e: React.PointerEvent) => {
    if (!trimDrag.current) return;
    const { trimId, loop, index } = trimDrag.current;
    const p = toTrimFrac(e.clientX, e.clientY);
    setTrimLens({ x: p.x * tDispW, y: p.y * tDispH });
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
      const seeded = NALICHNIK_SIDES.map((s) => {
        const rect = sideStrip(s.id === 'shaft-left' ? 'left' : 'right', leafRef);
        return { id: s.id, role: 'shaft' as TrimRole, label: s.label, rect, points: seedPoints(rect) };
      });
      setTrim((ts) => [...ts, ...seeded]);
      setActiveTrimId(seeded[0].id);
      return;
    }
    setActiveTrimId(trim.find((t) => roles.includes(t.role))?.id ?? null);
  };

  /** Has the operator actually cut this door to a shape, or is it still the
   *  rectangle every door starts as? */
  const shaped = !isFullRect(shape);

  /**
   * The leaf exactly as it will be published: flattened, de-handled, white
   * balanced if it is declared white, scaled down, and cut to its outline.
   *
   * One function for both the preview and the publish, because the preview's
   * entire job is to be the published result — they had drifted already, with
   * only the preview asking for a high-quality downscale.
   */
  const renderLeaf = (): HTMLCanvasElement => {
    const canvas = rectify(img!, corners as [Pt, Pt, Pt, Pt]);
    stripHandle(canvas, handleSide);
    if (white) neutraliseWhite(canvas);
    const scale = Math.min(1, 820 / canvas.width);
    const small = document.createElement('canvas');
    small.width = Math.round(canvas.width * scale);
    small.height = Math.round(canvas.height * scale);
    const sc = small.getContext('2d')!;
    sc.imageSmoothingQuality = 'high';
    sc.drawImage(canvas, 0, 0, small.width, small.height);
    if (shaped) clipToShape(small, shape);
    return small;
  };

  /** WebP once a door has been cut to a shape: JPEG has no alpha and would
   *  publish the transparent surround as a solid block around the door. An
   *  uncut door keeps exactly the JPEG it has always had. */
  const encodeLeaf = (c: HTMLCanvasElement) =>
    shaped ? encodeAlpha(c, 0.9) : c.toDataURL('image/jpeg', 0.82);

  const check = async () => {
    if (!img || corners.length !== 4) return;
    setChecking(true);
    await new Promise((r) => setTimeout(r, 20));
    setResult(encodeLeaf(renderLeaf()));
    setChecking(false);
  };

  const publish = async () => {
    if (!img || corners.length !== 4) return;
    setBusy(true);
    try {
      await publishNow();
    } catch (err) {
      // Anything thrown in here used to leave the button reading
      // "Saqlanmoqda…" for good, with no way to tell what had gone wrong.
      // A rejected publish now says what the backend said — which for a
      // validation failure names the field.
      setBusy(false);
      toast(err instanceof ApiError ? err.message : 'Saqlashda xatolik — qaytadan urinib ko‘ring');
      return;
    }
    setBusy(false);
    toast('Saqlandi ✓');
    onDone();
  };

  const publishNow = async () => {
    if (!img || corners.length !== 4) return;
    // Render the door at full quality now — publishing never depends on
    // the optional check() above having been run.
    const small = renderLeaf();

    const [TL, TR, BR, BL] = corners;
    const topW = Math.hypot(TR.x - TL.x, TR.y - TL.y);
    const botW = Math.hypot(BR.x - BL.x, BR.y - BL.y);
    const hgt = (Math.hypot(BL.x - TL.x, BL.y - TL.y) + Math.hypot(BR.x - TR.x, BR.y - TR.y)) / 2;
    const doorCorners = corners.map((c) => ({ x: +(c.x / img.width).toFixed(4), y: +(c.y / img.height).toFixed(4) }));

    const payload: LeafPayload = {
      leaf: {
        name: { uz: name || 'Eshik', kk: name || 'Esik', ru: name || 'Дверь' },
        aspect: +(((topW + botW) / 2) / hgt).toFixed(4),
        handleSide: handleSide === 'none' ? 'left' : handleSide,
        handleSwappable: handleSide !== 'none',
        handleAt: handleSide !== 'none' ? { x: handleSide === 'left' ? 0.09 : 0.91, y: 0.56 } : null,
        white,
        handleChoice: handleSide,
        corners: doorCorners,
        // Always sent, never omitted: the backend preserves on absence, so a
        // door the operator straightened back into a rectangle would otherwise
        // keep a mask it no longer has. Explicit null is how a cut is undone.
        shape: shaped ? shape : null,
        // "Every colour, including ones registered after today" is a mode of
        // its own, not an empty list — a door sold in no colours at all is a
        // different (if odd) statement, and the backend keeps them apart.
        colorMode: selected.size === colors.length ? 'all' : 'list',
        colorIds: selected.size === colors.length ? undefined : [...selected],
        trimRoleMode: trimRoles.size === DOOR_TRIM_ROLES.length ? 'all' : 'list',
        trimRoles: trimRoles.size === DOOR_TRIM_ROLES.length ? undefined : [...trimRoles],
      },
    };

    const files: { image?: Blob; source?: Blob; trimSource?: Blob } = {
      image: dataUrlToBlob(encodeLeaf(small)),
      // Only a freshly uploaded photograph is a data URL. Reopening a door
      // hands back the STORED one as a plain url, and re-uploading it would
      // mean decoding a url as base64 — which threw, and took the whole
      // re-publish down with it. Omitted, the backend keeps what it has.
      source: source?.startsWith('data:') ? dataUrlToBlob(source) : undefined,
    };

    /*
     * Whatever was traced goes out as its own catalogue design, split by role
     * into up to two — but in the SAME request as the door, because the
     * backend writes all three in one transaction. Sending them separately
     * would make a half-published door reachable by the showroom.
     */
    if (trim.length > 0) {
      const tc = rectify(img, corners as [Pt, Pt, Pt, Pt], 1200, marginObj);
      // Sized so the DOOR keeps about 600px across it, not the whole padded
      // canvas: now that the reveal is whatever the photograph shows, a flat
      // total would leave the casing itself coarse.
      const tscale = Math.min(1, Math.min(1600, 600 * (1 + marginObj.left + marginObj.right)) / tc.width);
      const tsmall = document.createElement('canvas');
      tsmall.width = Math.round(tc.width * tscale);
      tsmall.height = Math.round(tc.height * tscale);
      tsmall.getContext('2d')!.drawImage(tc, 0, 0, tsmall.width, tsmall.height);
      files.trimSource = dataUrlToBlob(encodeAlpha(tsmall, 0.85));

      const forCategory = (category: 'nalichnik' | 'korona') => {
        const pieces = category === 'korona'
          ? trim.filter((t) => t.role === 'crown')
          : trim.filter((t) => NALICHNIK_ROLES.includes(t.role));
        // Nothing traced for this category: whatever was published before is
        // left exactly as it is. A design is independent once it is out in
        // the catalogue, and the finish stage says so rather than quietly
        // deleting something a customer may already be choosing.
        if (!pieces.length) return null;
        const label = category === 'nalichnik' ? 'Nalichnik' : 'Korona';
        const given = (category === 'nalichnik' ? nalichnikName : koronaName).trim() || label;
        return {
          category,
          name: { uz: given, kk: given, ru: given },
          trimMargin: marginObj,
          trimBoxes: pieces.map(toStoredTrim),
          corners: doorCorners,
        };
      };
      const trims = [forCategory('nalichnik'), forCategory('korona')].filter((t) => t !== null);
      if (trims.length) payload.trims = trims;
    }

    await publishLeaf(payload, files, edit?.id);
  };

  const dispW = img ? img.width * zoom : 0;
  const dispH = img ? img.height * zoom : 0;
  const activeTrim = trim.find((t) => t.id === activeTrimId) ?? null;
  const trimStage = stage === 'nalichnik' || stage === 'korona' ? stage : null;
  /** Only the pieces this stage owns. Each stage is cut, judged and named on
   *  its own, so the nalichnik's pieces must never appear while the korona is
   *  being worked on — that mixing is what made a bad trace impossible to
   *  attribute to one or the other.
   *
   *  Memoized because `maskedPreview` below takes it as a dependency, and
   *  `useRender` blanks its layer on every dep change (recolor.ts). A fresh
   *  array each render meant the cut-out preview flickered off and re-derived
   *  on every keystroke and every drag frame — the same defect, from the same
   *  cause, that WallStage's trim layer was already fixed for once. */
  const stagePieces = useMemo(
    () => (trimStage ? trim.filter((t) => STAGE_ROLES[trimStage].includes(t.role) || (trimStage === 'nalichnik' && t.role === 'extra')) : []),
    [trimStage, trim]
  );
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
    [showResult, paddedImg, stagePieces, stage, marginObj]
  );
  /** What the photograph itself says about the door's paint — the warning
   *  beside the switch compares the operator's choice against it. */
  const whiteFromPhoto = useMemo(() => {
    if (!img || corners.length !== 4) return true;
    try { return looksWhite(rectify(img, corners as [Pt, Pt, Pt, Pt], 300)); } catch { return true; }
  }, [img, corners]);

  /** Categories this door published before but has nothing traced for now.
   *  Their designs stay in the catalog on purpose; this is what keeps that
   *  from being a silent mismatch. */
  const orphaned = (edit ? (['nalichnik', 'korona'] as const) : []).filter((c) => {
    const has = c === 'korona' ? trim.some((t) => t.role === 'crown') : trim.some((t) => NALICHNIK_ROLES.includes(t.role));
    return !has && doorTrims.some((t) => t.category === c);
  }).map((c) => (c === 'korona' ? 'korona' : 'nalichnik'));

  const tDispW = paddedImg ? paddedImg.width * zoom : 0;
  const tDispH = paddedImg ? paddedImg.height * zoom : 0;
  const sDispW = shapeImg ? shapeImg.width * zoom : 0;
  const sDispH = shapeImg ? shapeImg.height * zoom : 0;

  /*
   * Nothing is editable until a reopened door is fully in the form.
   *
   * Not politeness: before this point the stages hold a NEW door's defaults,
   * and the nalichnik stage seeds two strips the moment it is opened. Work
   * done in that window is either overwritten when the real outlines land, or
   * published over the ones the operator actually cut.
   */
  if (loadingEdit) {
    return (
      <div style={{ display: 'flex', height: '100%', width: '100%', alignItems: 'center', justifyContent: 'center', background: COLOR.studio }}>
        <div style={{ ...TYPE.small, color: COLOR.inkSoft }}>Eshik yuklanmoqda…</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', minHeight: 0 }}>
      <div className="scr" style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 20, display: 'flex', alignItems: 'flex-start', background: COLOR.studio }}>
        {!img && (
          <label style={{ margin: 'auto', textAlign: 'center', cursor: 'pointer', border: `1.5px dashed ${COLOR.lineStrong}`, borderRadius: RADIUS, padding: '64px 80px', background: '#fff' }}>
            <div style={{ ...TYPE.h2, color: COLOR.ink, marginBottom: 8 }}>Eshik rasmini yuklang</div>
            <div style={{ ...TYPE.small, color: COLOR.inkSoft }}>Istalgan burchakdan — 4 burchagini o‘zingiz belgilaysiz</div>
            <input type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
          </label>
        )}
        {img && !onTrimStage && stage !== 'shape' && (
          <div ref={wrapRef} style={{ position: 'relative', width: dispW, height: dispH, flexShrink: 0, margin: '0 auto', touchAction: 'none' }} onPointerMove={onMove} onPointerUp={() => { drag.current = null; setLens(null); }}>
            <img src={img.src} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none' }} />
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              <polygon points={corners.map((c) => `${c.x * zoom},${c.y * zoom}`).join(' ')} fill={TRACE.doorFill} stroke={COLOR.brass} strokeWidth={2} />
            </svg>
            {corners.map((c, i) => (
              <Handle key={i} x={c.x * zoom} y={c.y * zoom} onPointerDown={(e) => { (e.target as Element).setPointerCapture(e.pointerId); drag.current = i; }} />
            ))}
            {lens && <Loupe src={img.src} dispW={dispW} dispH={dispH} x={lens.x} y={lens.y} />}
          </div>
        )}
        {/* The door's own edge, traced on the flattened door. Unlike the four
            corners above this is a free polygon — points are added along it and
            removed from it, because a silhouette has no fixed number of sides
            while a homography has exactly four correspondences. */}
        {stage === 'shape' && shapeImg && (
          <div
            ref={shapeWrapRef}
            style={{ position: 'relative', width: sDispW, height: sDispH, flexShrink: 0, margin: '0 auto', touchAction: 'none' }}
            onPointerMove={onShapeMove}
            onPointerUp={() => { shapeDrag.current = null; setShapeLens(null); }}
            onPointerDown={onShapeAddPoint}
          >
            <img src={shapeImg.src} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none' }} />
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              <TraceShape points={shape} color={COLOR.brass} w={sDispW} h={sDispH} />
            </svg>
            {shape.map((p, i) => (
              <Handle
                key={i}
                x={p.x * sDispW}
                y={p.y * sDispH}
                onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture(e.pointerId); shapeDrag.current = i; }}
                onDoubleClick={() => removeShapePoint(i)}
              />
            ))}
            {shapeLens && <Loupe src={shapeImg.src} dispW={sDispW} dispH={sDispH} x={shapeLens.x} y={shapeLens.y} />}
          </div>
        )}
        {showTrimStudio && (
          <div
            ref={trimWrapRef}
            style={{
              position: 'relative', width: tDispW, height: tDispH, flexShrink: 0, margin: '0 auto', touchAction: 'none',
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
            onPointerUp={showResult || !activeTrim ? undefined : () => { trimDrag.current = null; setTrimLens(null); }}
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
                <TraceShape
                  points={activeTrim.points}
                  holePoints={activeTrim.holePoints}
                  color={ROLE_META[activeTrim.role].color}
                  w={tDispW}
                  h={tDispH}
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
            {/* The padded photo, never the cut-out preview: the loupe is for
                aiming at the moulding, and in the preview it is gone. */}
            {trimLens && !showResult && paddedImg && (
              <Loupe src={paddedImg.src} dispW={tDispW} dispH={tDispH} x={trimLens.x} y={trimLens.y} />
            )}
          </div>
        )}
      </div>

      <Panel>
        <PanelBody>
          <div style={{ ...TYPE.h2, color: COLOR.ink, margin: '0 0 4px' }}>{edit ? 'Eshikni tahrirlash' : 'Yangi eshik'}</div>
          {!img && <div style={{ ...TYPE.small, color: COLOR.inkSoft }}>Boshlash uchun eshik rasmini yuklang.</div>}
          {img && (
            <>
              <Stepper stage={stage} onGo={goStage} enabled={!!live} />
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
                <div style={{ fontSize: 12, color: COLOR.inkSoft, lineHeight: 1.5, marginTop: 6 }}>
                  «Oq bo‘yoq» eshikning oq rangini bir xil oqqa keltiradi —
                  faqat haqiqatan oq eshiklar uchun. Rangli eshikda uni yoqsangiz
                  surat oqarib ketadi va orqaga qaytarib bo‘lmaydi. Surat
                  bo‘yicha o‘zi tanlandi.
                </div>
                {white && !whiteFromPhoto && (
                  <div style={{ fontSize: 12, color: DANGER.text, lineHeight: 1.5, marginTop: 6 }}>
                    Bu surat rangli eshikka o‘xshaydi, lekin «Oq bo‘yoq» yoqilgan —
                    shu holda nashr qilinsa rangi oqarib ketadi. «Rangli» ni tanlang.
                  </div>
                )}
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
                  <AdminGhostButton onClick={() => void addColor()} style={{ width: 'auto', minHeight: TOUCH_MIN, padding: '0 14px', fontSize: 13 }}>+ Qo‘shish</AdminGhostButton>
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

              {stage === 'shape' && (
                <Section title="Eshik cheti">
                  <div style={{ ...TYPE.small, color: COLOR.inkSoft, marginBottom: 10 }}>
                    {shaped
                      ? `${shape.length} ta nuqta. Chetdan tashqarisi shaffof bo‘ladi.`
                      : 'Hozircha to‘g‘ri to‘rtburchak — hech nima kesilmaydi.'}
                  </div>
                  <AdminGhostButton onClick={() => setShape(FULL_RECT)} disabled={!shaped}>
                    To‘rtburchakka qaytarish
                  </AdminGhostButton>
                </Section>
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

              {stage === 'finish' && orphaned.length > 0 && (
                <div style={{ fontSize: 12, color: COLOR.inkSoft, lineHeight: 1.5, marginTop: 12, padding: 10, border: `1px solid ${COLOR.line}`, borderRadius: RADIUS_SM }}>
                  Bu eshikda {orphaned.join(' va ')} chizilmagan, lekin ilgari
                  nashr qilingani katalogda turibdi va mijozga ko‘rinaveradi.
                  Kerak bo‘lmasa «Nalichniklar» bo‘limidan o‘chiring.
                </div>
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
                <>
                  <AdminGhostButton onClick={onDone} style={{ flex: '0 0 auto', width: 'auto', padding: '0 16px' }}>
                    ← Orqaga
                  </AdminGhostButton>
                  <AdminPrimaryButton onClick={() => goStage('shape')} disabled={!live} style={{ flex: 1 }}>
                    Davom etish →
                  </AdminPrimaryButton>
                </>
              )}
              {stage === 'shape' && (
                <AdminPrimaryButton onClick={() => goStage('nalichnik')} style={{ flex: 1 }}>
                  {shaped ? 'Davom etish →' : 'O‘tkazib yuborish →'}
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
                  <AdminPrimaryButton onClick={() => void publish()} disabled={!live || busy} style={{ flex: 1 }}>
                    {busy ? 'Saqlanmoqda…' : edit ? 'Saqlash ✓' : 'Qo‘shish ✓'}
                  </AdminPrimaryButton>
                </>
              )}
              {/* Editing an existing door can end at any stage. Coming back to
                  straighten the four corners should not mean walking the trim
                  stages again to reach a save button — and every stage already
                  holds this door's real state, so saving from here republishes
                  exactly what was restored plus whatever was just changed. */}
              {edit && stage !== 'finish' && (
                <AdminGhostButton onClick={() => void publish()} disabled={!live || busy} style={{ flex: '0 0 auto', width: 'auto', padding: '0 16px' }}>
                  {busy ? 'Saqlanmoqda…' : 'Saqlash ✓'}
                </AdminGhostButton>
              )}
            </div>
          </PanelFooter>
        )}
      </Panel>
    </div>
  );
}
