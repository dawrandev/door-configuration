import { useEffect, useState } from 'react';
import { COLOR, FONT, RADIUS, RADIUS_SM, TOUCH_MIN, TYPE } from '../design/tokens';
import { LEAVES as BASE_LEAVES } from '../catalog/leaves.generated';
import { ROOMS as BASE_ROOMS } from '../catalog/rooms.generated';
import type { Leaf, Room } from '../catalog/types';
import { DoorBench } from './DoorBench';
import { RoomBench } from './RoomBench';
import { Masthead, ToastHost, ConfirmBar, DANGER, AdminGhostButton, AdminPrimaryButton, useToast } from './adminKit';
import {
  mergeLeaves, mergeRooms, editLeaf, editRoom, removeLeaf, removeRoom, restoreLeaf, restoreRoom,
  loadLeafEdits, loadRoomEdits, isBuiltIn, isOverridden, isRoomOverridden,
  type AdminLeaf, type AdminRoom,
} from './adminStore';

/**
 * The workshop bench: one place to manage the whole catalogue.
 *
 * Two tabs, doors and rooms, each a list of everything the showroom shows —
 * built-ins and bench-added alike, since they are the same shape. A built-in is
 * never deleted (its pixels are in the bundle) only hidden, and can be restored;
 * a bench item is deleted outright. Adding is the corner/box tool one tab over.
 * The customer never reaches here; staff type the address.
 *
 * Same ink-on-limestone chrome as the showroom (design/tokens.ts) — a
 * salesperson moves between this and the client screen all day, and a second,
 * unrelated dark "developer" theme here read as a different, unfinished
 * product bolted on. One brand, one bench.
 */
type Tab = 'doors' | 'rooms';

export function Admin() {
  const [tab, setTab] = useState<Tab>('doors');
  const [adding, setAdding] = useState(false);
  const [editLeafItem, setEditLeafItem] = useState<AdminLeaf | null>(null);
  const [editRoomItem, setEditRoomItem] = useState<AdminRoom | null>(null);
  const [query, setQuery] = useState('');
  const [, force] = useState(0);
  useEffect(() => {
    const r = () => force((n) => n + 1);
    window.addEventListener('dc-catalog-changed', r);
    return () => window.removeEventListener('dc-catalog-changed', r);
  }, []);

  const closeBench = () => { setAdding(false); setEditLeafItem(null); setEditRoomItem(null); };
  if (editLeafItem) return <Shell onDone={closeBench}><DoorBench edit={editLeafItem} onDone={closeBench} /></Shell>;
  if (editRoomItem) return <Shell onDone={closeBench}><RoomBench edit={editRoomItem} onDone={closeBench} /></Shell>;
  if (adding && tab === 'doors') return <Shell onDone={closeBench}><DoorBench onDone={closeBench} /></Shell>;
  if (adding && tab === 'rooms') return <Shell onDone={closeBench}><RoomBench onDone={closeBench} /></Shell>;

  const leaves = mergeLeaves(BASE_LEAVES);
  const rooms = mergeRooms(BASE_ROOMS);
  const hiddenLeaves = Object.entries(loadLeafEdits()).filter(([, e]) => e.hidden).map(([id]) => id);
  const hiddenRooms = Object.entries(loadRoomEdits()).filter(([, e]) => e.hidden).map(([id]) => id);

  const q = query.trim().toLowerCase();
  const shownLeaves = q ? leaves.filter((l) => l.name.uz.toLowerCase().includes(q)) : leaves;
  const shownRooms = q ? rooms.filter((r) => r.name.uz.toLowerCase().includes(q)) : rooms;

  const recent = mostRecent([...leaves, ...rooms]);

  return (
    <Shell>
      <div className="scr" style={{ flex: 1, overflowY: 'auto', padding: '24px clamp(20px,4vw,56px) 28px' }}>
        <Stats
          doorCount={leaves.length}
          roomCount={rooms.length}
          hiddenCount={hiddenLeaves.length + hiddenRooms.length}
          recentName={recent?.name.uz}
        />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 14 }}>
          <div style={{ display: 'flex', gap: 4, background: COLOR.panel, border: `1px solid ${COLOR.line}`, borderRadius: 999, padding: 4 }}>
            {(['doors', 'rooms'] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)} style={pill(tab === t)}>{t === 'doors' ? `Eshiklar (${leaves.length})` : `Xonalar (${rooms.length})`}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: '1 1 240px', maxWidth: 420 }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nomi bo‘yicha qidirish…"
              style={{ ...searchInput, flex: 1 }}
            />
            <AdminPrimaryButton onClick={() => setAdding(true)} style={{ width: 'auto', whiteSpace: 'nowrap', padding: '0 20px' }}>
              + {tab === 'doors' ? 'Yangi eshik' : 'Yangi xona'}
            </AdminPrimaryButton>
          </div>
        </div>

        <div style={{ ...TYPE.small, color: COLOR.inkSoft, marginBottom: 22 }}>
          {tab === 'doors'
            ? 'Eshikning shakli (4 burchak) va u sotiladigan ranglar shu yerda belgilanadi.'
            : 'Devor fotosurati, eshik teshigi va nalichnik (uning ranglanadigan qismlari) shu yerda belgilanadi.'}
        </div>

        {tab === 'doors' ? (
          // While searching, a hidden item never renders (search only shows
          // shownLeaves) — so it must not count toward "there's something
          // here", or a query matching zero visible doors renders a blank
          // grid instead of the empty state.
          shownLeaves.length === 0 && (q || hiddenLeaves.length === 0) ? (
            <EmptyState label={q ? 'Shu nomda eshik topilmadi' : 'Hozircha eshiklar yo‘q — yuqoridagi tugma bilan qo‘shing'} />
          ) : (
            <Grid>
              {shownLeaves.map((l) => <DoorCard key={l.id} leaf={l} onEdit={() => setEditLeafItem(l as AdminLeaf)} />)}
              {!q && hiddenLeaves.map((id) => <HiddenCard key={id} label={BASE_LEAVES.find((l) => l.id === id)?.name.uz ?? id} onRestore={() => restoreLeaf(id)} />)}
            </Grid>
          )
        ) : shownRooms.length === 0 && (q || hiddenRooms.length === 0) ? (
          <EmptyState label={q ? 'Shu nomda xona topilmadi' : 'Hozircha xonalar yo‘q — yuqoridagi tugma bilan qo‘shing'} />
        ) : (
          <Grid>
            {shownRooms.map((r) => <RoomCard key={r.id} room={r} onEdit={() => setEditRoomItem(r as AdminRoom)} />)}
            {!q && hiddenRooms.map((id) => <HiddenCard key={id} label={BASE_ROOMS.find((r) => r.id === id)?.name.uz ?? id} onRestore={() => restoreRoom(id)} />)}
          </Grid>
        )}
      </div>
    </Shell>
  );
}

/** The most recently created/re-cut item, across doors and rooms — only
 *  bench-touched items carry a `createdAt`, so a stock built-in never wins
 *  this even though it's structurally the same shape. */
function mostRecent(items: (Leaf | Room)[]): (Leaf | Room) | null {
  const dated = items.filter((i): i is (Leaf | Room) & { createdAt: number } => typeof (i as AdminLeaf | AdminRoom).createdAt === 'number');
  if (!dated.length) return null;
  return dated.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
}

function Stats({ doorCount, roomCount, hiddenCount, recentName }: { doorCount: number; roomCount: number; hiddenCount: number; recentName?: string }) {
  const tiles: { label: string; value: string }[] = [
    { label: 'Eshiklar', value: String(doorCount) },
    { label: 'Xonalar', value: String(roomCount) },
    { label: 'Yashiringan', value: String(hiddenCount) },
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

function DoorCard({ leaf, onEdit }: { leaf: Leaf; onEdit: () => void }) {
  const [name, setName] = useState(leaf.name.uz);
  const builtIn = isBuiltIn(leaf.id);
  const overridden = isOverridden(leaf.id);
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
      <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== leaf.name.uz && editLeaf(leaf.id, { name })} style={cardInput} />
      <div style={{ ...TYPE.label, fontSize: 10, color: COLOR.inkSoft, marginTop: 6 }}>{colorNote}</div>
      <DeleteRow onEdit={canReedit ? onEdit : undefined} onDelete={() => removeLeaf(leaf.id)} kind={overridden ? 'restore' : 'delete'} itemName={leaf.name.uz} />
    </Card>
  );
}

function RoomCard({ room, onEdit }: { room: Room; onEdit: () => void }) {
  const [name, setName] = useState(room.name.uz);
  const builtIn = isBuiltIn(room.id);
  const overridden = isRoomOverridden(room.id);
  const canReedit = !!(room as AdminRoom).source || !builtIn;
  const trimCount = room.trimBoxes?.length ?? 0;
  const trimNote = trimCount === 0 ? 'Nalichniksiz' : `${trimCount} ta nalichnik qismi`;
  return (
    <Card>
      <div style={{ aspectRatio: THUMB_RATIO, background: `${COLOR.panel} url(${room.thumb ?? room.image}) center 28%/cover`, borderRadius: RADIUS_SM, position: 'relative' }}>
        {builtIn ? <span style={badge}>{overridden ? 'tahrirlangan' : 'tayyor'}</span> : <span style={badgeAdded}>qo‘shilgan</span>}
      </div>
      <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== room.name.uz && editRoom(room.id, { name })} style={cardInput} />
      <div style={{ ...TYPE.label, fontSize: 10, color: COLOR.inkSoft, marginTop: 6 }}>{trimNote}</div>
      <DeleteRow onEdit={canReedit ? onEdit : undefined} onDelete={() => removeRoom(room.id)} kind={overridden ? 'restore' : 'delete'} itemName={room.name.uz} />
    </Card>
  );
}

/** Edit + delete, with the delete swapping to an inline confirm strip on
 *  first tap instead of firing immediately — a bench-added item is gone
 *  for good once it does. */
function DeleteRow({ onEdit, onDelete, kind, itemName }: { onEdit?: () => void; onDelete: () => void; kind: 'delete' | 'restore'; itemName: string }) {
  const [confirming, setConfirming] = useState(false);
  const toast = useToast();
  if (confirming) {
    return (
      <div style={{ marginTop: 10 }}>
        <ConfirmBar
          message={`«${itemName}» o‘chirilsinmi?`}
          onCancel={() => setConfirming(false)}
          onConfirm={() => { onDelete(); toast('O‘chirildi'); setConfirming(false); }}
        />
      </div>
    );
  }
  const label = kind === 'restore' ? 'Aslini qaytarish' : 'O‘chirish';
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
      {onEdit && <AdminGhostButton onClick={onEdit} style={{ flex: 1 }}>Tahrirlash</AdminGhostButton>}
      <button
        onClick={() => (kind === 'restore' ? onDelete() : setConfirming(true))}
        style={{ flex: 1, minHeight: TOUCH_MIN, padding: '9px', borderRadius: RADIUS_SM, border: `1px solid ${DANGER.border}`, background: 'transparent', color: DANGER.text, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}
      >
        {label}
      </button>
    </div>
  );
}

function HiddenCard({ label, onRestore }: { label: string; onRestore: () => void }) {
  return (
    <Card>
      <div style={{ aspectRatio: THUMB_RATIO, background: COLOR.paper, borderRadius: RADIUS_SM, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLOR.inkSoft, fontSize: 13 }}>Yashirilgan</div>
      <div style={{ ...TYPE.small, color: COLOR.inkSoft, marginTop: 8 }}>{label}</div>
      <AdminGhostButton onClick={onRestore} style={{ marginTop: 10 }}>Qaytarish</AdminGhostButton>
    </Card>
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
