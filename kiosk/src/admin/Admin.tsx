import { useCallback, useEffect, useState } from 'react';
import { COLOR, FONT, RADIUS, RADIUS_SM, TOUCH_MIN, TYPE } from '../design/tokens';
import { DoorBench } from './DoorBench';
import { RoomBench } from './RoomBench';
import { TrimBench } from './TrimBench';
import { Masthead, ToastHost, Modal, ConfirmModal, DANGER, AdminGhostButton, AdminPrimaryButton, useToast } from './adminKit';
import {
  getAdminCatalog, renameItem, deleteItem, me, logout, getDiagnostics,
  type AdminCatalog, type AdminLeaf, type AdminRoom, type AdminTrim, type ItemKind,
} from '../api/catalog';
import { ApiError } from '../api/http';
import { BenchLogin } from './BenchLogin';
import { importLegacy, legacyCount, type ImportReport } from './importLegacy';

/**
 * The workshop bench: one place to manage the whole catalogue.
 *
 * Three tabs — doors, rooms, trims — each a list of everything the showroom
 * shows, built-ins and bench-added alike, since they are the same shape.
 * "O'chirish" always reads as a real, final delete from this screen: a
 * bench item is actually removed; a built-in (whose pixels are in the
 * bundle and can't literally be deleted) is hidden from the catalogue
 * instead, with no restore control here — that's a deliberate ask when it's
 * genuinely needed, not a self-service undo. Adding is the corner/box tool
 * one tab over. The customer never reaches here; staff type the address.
 *
 * Same ink-on-limestone chrome as the showroom (design/tokens.ts) — a
 * salesperson moves between this and the client screen all day, and a second,
 * unrelated dark "developer" theme here read as a different, unfinished
 * product bolted on. One brand, one bench.
 */
type Tab = 'doors' | 'rooms' | 'trims';
const TAB_LABEL: Record<Tab, string> = { doors: 'Eshiklar', rooms: 'Xonalar', trims: 'Nalichniklar' };
const TAB_ADD_LABEL: Record<Tab, string> = { doors: 'Yangi eshik', rooms: 'Yangi xona', trims: 'Yangi nalichnik' };

/**
 * Everything the list screen needs about the catalogue, read in one pass.
 *
 * Module scope, not a hook, so the initial state can be seeded with it lazily
 * (`useState(readCatalog)`) and the same code path serves both the first render
 * and every later refresh.
 */
const EMPTY: AdminCatalog = { version: '', leaves: [], rooms: [], trims: [], colors: [] };

/** Whether the bench has a session. Checked once, then again whenever a write
 *  comes back 401/419 — a session can expire mid-shift. */
type Session = 'checking' | 'out' | 'in';

export function Admin() {
  const [tab, setTab] = useState<Tab>('doors');
  const [adding, setAdding] = useState(false);
  const [editLeafItem, setEditLeafItem] = useState<AdminLeaf | null>(null);
  const [editRoomItem, setEditRoomItem] = useState<AdminRoom | null>(null);
  const [editTrimItem, setEditTrimItem] = useState<AdminTrim | null>(null);
  const [query, setQuery] = useState('');
  /**
   * The whole catalogue, resolved ONCE per change rather than once per render.
   *
   * `readCatalog` parses three stores out of localStorage — records that carry
   * base64 photographs — and it used to run in the render body, so every
   * keystroke in the search box below re-parsed all of it. The `overridden`
   * sets are folded in for the same reason: each card used to ask the store
   * that question for itself, which meant another full parse per built-in card
   * per render.
   *
   * Held in state and recomputed on the change event rather than memoised on a
   * counter — a counter would be a dependency the memo never reads, which is a
   * lie to anyone reading it and to the linter both.
   */
  const [session, setSession] = useState<Session>('checking');
  const [catalog, setCatalog] = useState<AdminCatalog>(EMPTY);
  const [loadError, setLoadError] = useState<string | null>(null);

  /**
   * The bench's catalogue, read from the backend rather than parsed out of
   * this browser. Held in state and reloaded after every write, so the list
   * always shows what the server actually holds — which is now the only copy.
   */
  const reload = useCallback(async () => {
    try {
      const next = await getAdminCatalog();
      if (next) setCatalog(next);
      setLoadError(null);
      setSession('in');
    } catch (e) {
      if (e instanceof ApiError && e.needsLogin) { setSession('out'); return; }
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await me();
        await reload();
      } catch {
        setSession('out');
      }
    })();
  }, [reload]);

  /** Every write goes through here so one expired session is handled once
   *  rather than in each of the three cards. */
  const run = useCallback(async (op: () => Promise<unknown>) => {
    try {
      await op();
      await reload();
    } catch (e) {
      if (e instanceof ApiError && e.needsLogin) setSession('out');
      else setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [reload]);

  const rename = useCallback((kind: ItemKind, id: string, uz: string) => {
    void run(() => renameItem(kind, id, { uz, kk: uz, ru: uz }));
  }, [run]);
  const remove = useCallback((kind: ItemKind, id: string) => {
    void run(() => deleteItem(kind, id));
  }, [run]);

  const closeBench = useCallback(() => {
    setAdding(false);
    setEditLeafItem(null);
    setEditRoomItem(null);
    setEditTrimItem(null);
    void reload();
  }, [reload]);

  if (session === 'checking') {
    return <Shell><div style={{ padding: 40, ...TYPE.small, color: COLOR.inkSoft }}>Tekshirilmoqda…</div></Shell>;
  }
  if (session === 'out') return <BenchLogin onDone={() => { setSession('checking'); void reload(); }} />;

  if (editLeafItem) return <Shell onDone={closeBench}><DoorBench edit={editLeafItem} onDone={closeBench} /></Shell>;
  if (editRoomItem) return <Shell onDone={closeBench}><RoomBench edit={editRoomItem} onDone={closeBench} /></Shell>;
  if (editTrimItem) return <Shell onDone={closeBench}><TrimBench edit={editTrimItem} onDone={closeBench} /></Shell>;
  if (adding && tab === 'doors') return <Shell onDone={closeBench}><DoorBench onDone={closeBench} /></Shell>;
  if (adding && tab === 'rooms') return <Shell onDone={closeBench}><RoomBench onDone={closeBench} /></Shell>;
  if (adding && tab === 'trims') return <Shell onDone={closeBench}><TrimBench onDone={closeBench} /></Shell>;

  const { leaves, rooms, trims } = catalog;

  const q = query.trim().toLowerCase();
  const shownLeaves = q ? leaves.filter((l) => l.name.uz.toLowerCase().includes(q)) : leaves;
  const shownRooms = q ? rooms.filter((r) => r.name.uz.toLowerCase().includes(q)) : rooms;
  const shownTrims = q ? trims.filter((t) => t.name.uz.toLowerCase().includes(q)) : trims;

  const recent = mostRecent([...leaves, ...rooms, ...trims]);

  return (
    <Shell>
      <div className="scr" style={{ flex: 1, overflowY: 'auto', padding: '24px clamp(20px,4vw,56px) 28px' }}>
        <Stats
          doorCount={leaves.length}
          roomCount={rooms.length}
          trimCount={trims.length}
          recentName={recent?.name.uz}
        />

        {loadError && (
          <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: RADIUS_SM, border: `1px solid ${DANGER.border}`, background: DANGER.bg, color: DANGER.text, fontSize: 13 }}>
            {loadError}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 14 }}>
          <div style={{ display: 'flex', gap: 4, background: COLOR.panel, border: `1px solid ${COLOR.line}`, borderRadius: 999, padding: 4 }}>
            {(['doors', 'rooms', 'trims'] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)} style={pill(tab === t)}>
                {TAB_LABEL[t]} ({t === 'doors' ? leaves.length : t === 'rooms' ? rooms.length : trims.length})
              </button>
            ))}
          </div>
          {/*
            * maxWidth belongs to the search box, not to the row. It used to sit
            * here, on a group of five - and since every button carries
            * whiteSpace: nowrap, they could neither shrink nor wrap and simply
            * ran off the right edge of the screen, taking Chiqish and the add
            * button with them.
            */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', flex: '1 1 320px' }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nomi bo‘yicha qidirish…"
              // minWidth:0 or a flex item refuses to shrink past its own
              // intrinsic width, which is what overflows a narrow row.
              style={{ ...searchInput, flex: '1 1 180px', minWidth: 0, maxWidth: 300 }}
            />
            <ImportLegacyButton onDone={() => void reload()} />
            <DiagnosticsButton />
            <AdminGhostButton
              onClick={() => { void (async () => { try { await logout(); } finally { setSession('out'); } })(); }}
              style={{ width: 'auto', whiteSpace: 'nowrap', padding: '0 14px' }}
            >
              Chiqish
            </AdminGhostButton>
            <AdminPrimaryButton onClick={() => setAdding(true)} style={{ width: 'auto', whiteSpace: 'nowrap', padding: '0 20px' }}>
              + {TAB_ADD_LABEL[tab]}
            </AdminPrimaryButton>
          </div>
        </div>

        <div style={{ ...TYPE.small, color: COLOR.inkSoft, marginBottom: 22 }}>
          {tab === 'doors'
            ? 'Eshikning shakli (4 burchak) va u sotiladigan ranglar shu yerda belgilanadi.'
            : tab === 'rooms'
              ? 'Devor fotosurati, eshik teshigi va nalichnik (uning ranglanadigan qismlari) shu yerda belgilanadi.'
              : 'Mustaqil nalichnik/korona dizayni — mijoz buni istalgan xona va eshikda tanlab ko‘ra oladi.'}
        </div>

        {tab === 'doors' ? (
          shownLeaves.length === 0 ? (
            <EmptyState label={q ? 'Shu nomda eshik topilmadi' : 'Hozircha eshiklar yo‘q — yuqoridagi tugma bilan qo‘shing'} />
          ) : (
            <Grid>
              {shownLeaves.map((l) => <DoorCard key={l.id} leaf={l} onEdit={() => setEditLeafItem(l)} onRename={(uz) => rename('leaves', l.id, uz)} onDelete={() => remove('leaves', l.id)} />)}
            </Grid>
          )
        ) : tab === 'rooms' ? (
          shownRooms.length === 0 ? (
            <EmptyState label={q ? 'Shu nomda xona topilmadi' : 'Hozircha xonalar yo‘q — yuqoridagi tugma bilan qo‘shing'} />
          ) : (
            <Grid>
              {shownRooms.map((r) => <RoomCard key={r.id} room={r} onEdit={() => setEditRoomItem(r)} onRename={(uz) => rename('rooms', r.id, uz)} onDelete={() => remove('rooms', r.id)} />)}
            </Grid>
          )
        ) : shownTrims.length === 0 ? (
          <EmptyState label={q ? 'Shu nomda nalichnik topilmadi' : 'Hozircha nalichnik dizaynlari yo‘q — yuqoridagi tugma bilan qo‘shing'} />
        ) : (
          <Grid>
            {shownTrims.map((t) => <TrimCard key={t.id} trim={t} onEdit={() => setEditTrimItem(t)} onRename={(uz) => rename('trims', t.id, uz)} onDelete={() => remove('trims', t.id)} />)}
          </Grid>
        )}
      </div>
    </Shell>
  );
}

/** The most recently published or re-cut item, across doors, rooms and trims.
 *  A stock built-in that nobody has touched carries the timestamp of the
 *  seed, so this is "what changed last", not "what is newest". */
function mostRecent(items: (AdminLeaf | AdminRoom | AdminTrim)[]): (AdminLeaf | AdminRoom | AdminTrim) | null {
  const dated = items.filter((i) => typeof i.updatedAt === 'string');
  if (!dated.length) return null;
  return dated.reduce((a, b) => (b.updatedAt! > a.updatedAt! ? b : a));
}

function Stats({ doorCount, roomCount, trimCount, recentName }: { doorCount: number; roomCount: number; trimCount: number; recentName?: string }) {
  const tiles: { label: string; value: string }[] = [
    { label: 'Eshiklar', value: String(doorCount) },
    { label: 'Xonalar', value: String(roomCount) },
    { label: 'Nalichniklar', value: String(trimCount) },
    { label: 'So‘nggi qo‘shilgan', value: recentName ?? '—' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
      {tiles.map((t) => (
        <div key={t.label} style={{ background: '#fff', border: `1px solid ${COLOR.line}`, borderRadius: RADIUS, padding: '12px 14px' }}>
          <div style={{ ...TYPE.label, fontSize: 10, color: COLOR.inkSoft }}>{t.label}</div>
          <div style={{ ...TYPE.data, fontSize: '1.15rem', color: COLOR.ink, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.value}</div>
        </div>
      ))}
    </div>
  );
}

function DoorCard({ leaf, onEdit, onRename, onDelete }: { leaf: AdminLeaf; onEdit: () => void; onRename: (uz: string) => void; onDelete: () => void }) {
  const [name, setName] = useState(leaf.name.uz);
  const builtIn = leaf.origin === 'builtin';
  const overridden = leaf.overridden;
  // Every door can be re-cut now: a bench door reloads its data URL, a built-in
  // its bundled source — so the first four are as editable as the rest.
  const canReedit = !!leaf.source || !builtIn;
  const colorNote = leaf.colorIds ? `${leaf.colorIds.length} ta rang` : 'Barcha ranglar';
  return (
    <Card>
      <div style={{ aspectRatio: THUMB_RATIO, background: COLOR.paper, borderRadius: RADIUS_SM, overflow: 'hidden', position: 'relative' }}>
        <img src={leaf.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        {builtIn ? <span style={badge}>{overridden ? 'tahrirlangan' : 'tayyor'}</span> : <span style={badgeAdded}>qo‘shilgan</span>}
      </div>
      <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => { if (name !== leaf.name.uz) onRename(name); }} style={cardInput} />
      <div style={{ ...TYPE.label, fontSize: 10, color: COLOR.inkSoft, marginTop: 6 }}>{colorNote}</div>
      <DeleteRow onEdit={canReedit ? onEdit : undefined} onDelete={onDelete} kind={overridden ? 'restore' : 'delete'} itemName={leaf.name.uz} />
    </Card>
  );
}

function RoomCard({ room, onEdit, onRename, onDelete }: { room: AdminRoom; onEdit: () => void; onRename: (uz: string) => void; onDelete: () => void }) {
  const [name, setName] = useState(room.name.uz);
  const builtIn = room.origin === 'builtin';
  const overridden = room.overridden;
  const canReedit = !!room.source || !builtIn;
  const trimCount = room.trimBoxes?.length ?? 0;
  const trimNote = trimCount === 0 ? 'Nalichniksiz' : `${trimCount} ta nalichnik qismi`;
  return (
    <Card>
      <div style={{ aspectRatio: THUMB_RATIO, background: `${COLOR.panel} url(${room.thumb ?? room.image}) center 28%/cover`, borderRadius: RADIUS_SM, position: 'relative' }}>
        {builtIn ? <span style={badge}>{overridden ? 'tahrirlangan' : 'tayyor'}</span> : <span style={badgeAdded}>qo‘shilgan</span>}
      </div>
      <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => { if (name !== room.name.uz) onRename(name); }} style={cardInput} />
      <div style={{ ...TYPE.label, fontSize: 10, color: COLOR.inkSoft, marginTop: 6 }}>{trimNote}</div>
      <DeleteRow onEdit={canReedit ? onEdit : undefined} onDelete={onDelete} kind={overridden ? 'restore' : 'delete'} itemName={room.name.uz} />
    </Card>
  );
}

function TrimCard({ trim, onEdit, onRename, onDelete }: { trim: AdminTrim; onEdit: () => void; onRename: (uz: string) => void; onDelete: () => void }) {
  const [name, setName] = useState(trim.name.uz);
  const builtIn = trim.origin === 'builtin';
  const overridden = trim.overridden;
  const canReedit = !!trim.source || !builtIn;
  const categoryLabel = trim.category === 'nalichnik' ? 'Nalichnik' : 'Korona';
  const pieceNote = `${categoryLabel} · ${trim.trimBoxes.length} ta qism`;
  return (
    <Card>
      <div style={{ aspectRatio: THUMB_RATIO, background: COLOR.paper, borderRadius: RADIUS_SM, overflow: 'hidden', position: 'relative' }}>
        <img src={trim.trimSource} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        {builtIn ? <span style={badge}>{overridden ? 'tahrirlangan' : 'tayyor'}</span> : <span style={badgeAdded}>qo‘shilgan</span>}
      </div>
      <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => { if (name !== trim.name.uz) onRename(name); }} style={cardInput} />
      <div style={{ ...TYPE.label, fontSize: 10, color: COLOR.inkSoft, marginTop: 6 }}>{pieceNote}</div>
      <DeleteRow onEdit={canReedit ? onEdit : undefined} onDelete={onDelete} kind={overridden ? 'restore' : 'delete'} itemName={trim.name.uz} />
    </Card>
  );
}

/**
 * Copy everything about the catalogue's GEOMETRY to the clipboard — every
 * trim design's margin, boxes and traced outlines, and every room's opening
 * and measured casing.
 *
 * Photographs are deliberately left out: what goes wrong with a trim is
 * almost always where its outline sits relative to the door, and that is a
 * few hundred bytes of numbers rather than megabytes of image. It exists
 * because "it does not show what I cut" cannot be diagnosed from a
 * screenshot — the numbers say immediately whether a design has no usable
 * boxes, or has them somewhere the door then covers.
 */
function DiagnosticsButton() {
  const toast = useToast();
  const copy = async () => {
    try {
      const report = await getDiagnostics();
      // Unindented: this gets pasted into a chat, and the numbers are the
      // point, not the layout.
      const text = JSON.stringify(report);
      try {
        await navigator.clipboard.writeText(text);
        toast('Nusxalandi — yopishtiring');
      } catch {
        // A clipboard the browser will not hand over (an insecure origin, a
        // permission refused) still has to give the numbers up somehow.
        const w = window.open('', '_blank');
        if (w) { w.document.write('<pre>' + text.replace(/</g, '&lt;') + '</pre>'); toast('Yangi oynada ochildi'); }
        else toast('Nusxalab bo‘lmadi');
      }
    } catch {
      toast('Tashxisni o‘qib bo‘lmadi');
    }
  };
  return (
    <AdminGhostButton onClick={() => void copy()} style={{ width: 'auto', whiteSpace: 'nowrap', padding: '0 14px' }}>
      Tashxis
    </AdminGhostButton>
  );
}

/** Edit + delete, with the delete opening a real modal first — an item is
 *  gone for good the moment it's confirmed (a bench-added item is deleted
 *  outright; a built-in is hidden from the catalogue, with no way back
 *  through this screen — ask for that if it's ever actually needed). */
function DeleteRow({ onEdit, onDelete, kind, itemName }: { onEdit?: () => void; onDelete: () => void; kind: 'delete' | 'restore'; itemName: string }) {
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();
  const label = kind === 'restore' ? 'Aslini qaytarish' : 'O‘chirish';
  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {onEdit && <AdminGhostButton onClick={onEdit} style={{ flex: 1 }}>Tahrirlash</AdminGhostButton>}
        <button
          onClick={() => (kind === 'restore' ? onDelete() : setConfirming(true))}
          style={{ flex: 1, minHeight: TOUCH_MIN, padding: '9px', borderRadius: RADIUS_SM, border: `1px solid ${DANGER.border}`, background: 'transparent', color: DANGER.text, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}
        >
          {label}
        </button>
      </div>
      {confirming && (
        <ConfirmModal
          title="O‘chirilsinmi?"
          message={`«${itemName}» butunlay o‘chiriladi. Bu amalni ortga qaytarib bo‘lmaydi.`}
          onCancel={() => setConfirming(false)}
          onConfirm={() => { onDelete(); toast('O‘chirildi'); setConfirming(false); }}
        />
      )}
    </>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div style={{ border: `1.5px dashed ${COLOR.lineStrong}`, borderRadius: RADIUS, padding: '64px 24px', textAlign: 'center', color: COLOR.inkSoft, ...TYPE.body }}>
      {label}
    </div>
  );
}

// ---- chrome ----
function Shell({ children, onDone }: { children: React.ReactNode; onDone?: () => void }) {
  return (
    <ToastHost>
      <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: COLOR.paper, color: COLOR.ink, fontFamily: FONT.sans }}>
        <Masthead onDone={onDone} />
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>{children}</div>
      </div>
    </ToastHost>
  );
}
/** Shared thumbnail ratio so a door card and a room card occupy the same
 *  footprint — switching tabs otherwise jumps between a tall strip and a
 *  short one, which reads as two different tools bolted together. Doors
 *  set the size (their own natural, tall proportion); rooms crop into it
 *  via their existing cover-fit background instead of shrinking down. */
const THUMB_RATIO = '0.42';
function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 18 }}>{children}</div>;
}
function Card({ children }: { children: React.ReactNode }) {
  return <div className="dc-lift" style={{ background: '#fff', border: `1px solid ${COLOR.line}`, borderRadius: RADIUS, padding: 12, boxShadow: '0 1px 3px rgba(35,32,27,.05)' }}>{children}</div>;
}

const pill = (on: boolean): React.CSSProperties => ({
  minHeight: TOUCH_MIN, padding: '9px 18px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: on ? 600 : 400, fontFamily: 'inherit',
  background: on ? COLOR.ink : 'transparent', color: on ? COLOR.onInk : COLOR.inkSoft,
});
const searchInput: React.CSSProperties = { minHeight: TOUCH_MIN, padding: '0 14px', borderRadius: RADIUS, border: `1px solid ${COLOR.lineStrong}`, background: '#fff', color: COLOR.ink, fontSize: 14, fontFamily: 'inherit' };
const cardInput: React.CSSProperties = { width: '100%', minHeight: TOUCH_MIN, marginTop: 10, padding: '7px 9px', borderRadius: RADIUS_SM, background: COLOR.paper, color: COLOR.ink, border: `1px solid ${COLOR.line}`, fontSize: 13, fontFamily: 'inherit' };
const badge: React.CSSProperties = { position: 'absolute', top: 6, left: 6, ...TYPE.label, fontSize: 10, color: COLOR.ink, background: 'rgba(255,255,255,.88)', padding: '3px 8px', borderRadius: 999 };
/** A bench-added item never gets `badge` (that's reserved for built-ins) — it
 *  otherwise carries no marker at all, so "tayyor / tahrirlangan / qo'shilgan"
 *  reads as three states only by IMPLIED absence. This makes it explicit. */
const badgeAdded: React.CSSProperties = { ...badge, color: COLOR.onInk, background: 'rgba(143,113,69,.92)' };

/**
 * Carry a pre-backend bench across, once.
 *
 * Only appears when this browser actually still holds the old drawers, so on
 * every machine that never had them — which is most of them, and all of them
 * eventually — there is nothing to explain. It never runs on its own: an
 * import that fired the first time a stale laptop opened the bench would
 * rewrite a catalogue everyone else is already using.
 */
function ImportLegacyButton({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [count] = useState(legacyCount);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);

  if (count === 0) return null;

  const run = async () => {
    setAsking(false);
    setBusy(true);
    try {
      const r = await importLegacy((m) => toast(m));
      setReport(r);
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Ko‘chirib bo‘lmadi');
    }
    setBusy(false);
  };

  return (
    <>
      <AdminGhostButton onClick={() => setAsking(true)} disabled={busy} style={{ width: 'auto', whiteSpace: 'nowrap', padding: '0 14px' }}>
        {busy ? 'Ko‘chirilmoqda…' : `Eskisini ko‘chirish (${count})`}
      </AdminGhostButton>

      {asking && (
        <ConfirmModal
          title="Eski katalogni ko‘chirilsinmi?"
          message={`Shu brauzerda saqlangan ${count} ta yozuv serverga yuboriladi. Eski nusxa joyida qoladi — hech narsa o‘chirilmaydi.`}
          confirmLabel="Ha, ko‘chirish"
          onCancel={() => setAsking(false)}
          onConfirm={() => void run()}
        />
      )}

      {report && (
        <Modal onClose={() => setReport(null)}>
          <div style={{ ...TYPE.h2, color: COLOR.ink, marginBottom: 10 }}>Ko‘chirildi</div>
          <div style={{ ...TYPE.small, color: COLOR.inkSoft, lineHeight: 1.7 }}>
            Ranglar: {report.colors} · Xonalar: {report.rooms} · Eshiklar: {report.leaves} · Nalichniklar: {report.trims}
            {report.renamed > 0 && <> · Nomlar: {report.renamed}</>}
          </div>
          {report.wasHidden.length > 0 && (
            <div style={{ ...TYPE.small, color: COLOR.inkSoft, lineHeight: 1.6, marginTop: 10 }}>
              Eski katalogda yashirilgan edi, lekin bu yerda yashirilmadi: {report.wasHidden.join(', ')}
            </div>
          )}
          {report.failed.length > 0 && (
            <div style={{ fontSize: 12, color: DANGER.text, lineHeight: 1.6, marginTop: 10 }}>
              Ko‘chmadi:
              {report.failed.map((f) => <div key={f.kind + f.id}>{f.kind} {f.id} — {f.why}</div>)}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
