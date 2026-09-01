import { useEffect, useState } from 'react';
import { COLOR, FONT, RADIUS, RADIUS_SM, TYPE } from '../design/tokens';
import { LEAVES as BASE_LEAVES } from '../catalog/leaves.generated';
import { ROOMS as BASE_ROOMS } from '../catalog/rooms.generated';
import type { Leaf, Room } from '../catalog/types';
import { DoorBench } from './DoorBench';
import { RoomBench } from './RoomBench';
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
  const [, force] = useState(0);
  useEffect(() => {
    const r = () => force((n) => n + 1);
    window.addEventListener('dc-catalog-changed', r);
    return () => window.removeEventListener('dc-catalog-changed', r);
  }, []);

  const closeBench = () => { setAdding(false); setEditLeafItem(null); setEditRoomItem(null); };
  if (editLeafItem) return <Shell><DoorBench edit={editLeafItem} onDone={closeBench} /></Shell>;
  if (editRoomItem) return <Shell><RoomBench edit={editRoomItem} onDone={closeBench} /></Shell>;
  if (adding && tab === 'doors') return <Shell><DoorBench onDone={closeBench} /></Shell>;
  if (adding && tab === 'rooms') return <Shell><RoomBench onDone={closeBench} /></Shell>;

  const leaves = mergeLeaves(BASE_LEAVES);
  const rooms = mergeRooms(BASE_ROOMS);
  const hiddenLeaves = Object.entries(loadLeafEdits()).filter(([, e]) => e.hidden).map(([id]) => id);
  const hiddenRooms = Object.entries(loadRoomEdits()).filter(([, e]) => e.hidden).map(([id]) => id);

  return (
    <Shell>
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px clamp(20px,4vw,56px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 14 }}>
          <div style={{ display: 'flex', gap: 4, background: COLOR.panel, border: `1px solid ${COLOR.line}`, borderRadius: 999, padding: 4 }}>
            {(['doors', 'rooms'] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)} style={pill(tab === t)}>{t === 'doors' ? `Eshiklar (${leaves.length})` : `Xonalar (${rooms.length})`}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <a href="#/" style={{ ...TYPE.small, color: COLOR.inkSoft, textDecoration: 'none' }}>Client sayt →</a>
            <button onClick={() => setAdding(true)} style={primaryBtn}>
              + {tab === 'doors' ? 'Yangi eshik' : 'Yangi xona'}
            </button>
          </div>
        </div>

        <div style={{ ...TYPE.small, color: COLOR.inkSoft, marginBottom: 22 }}>
          {tab === 'doors'
            ? 'Eshikning shakli (4 burchak) va u sotiladigan ranglar shu yerda belgilanadi.'
            : 'Devor fotosurati, eshik teshigi va nalichnik (uning ranglanadigan qismlari) shu yerda belgilanadi.'}
        </div>

        {tab === 'doors' ? (
          leaves.length === 0 && hiddenLeaves.length === 0 ? (
            <EmptyState label="Hozircha eshiklar yo‘q — yuqoridagi tugma bilan qo‘shing" />
          ) : (
            <Grid>
              {leaves.map((l) => <DoorCard key={l.id} leaf={l} onEdit={() => setEditLeafItem(l as AdminLeaf)} />)}
              {hiddenLeaves.map((id) => <HiddenCard key={id} label={BASE_LEAVES.find((l) => l.id === id)?.name.uz ?? id} onRestore={() => restoreLeaf(id)} />)}
            </Grid>
          )
        ) : rooms.length === 0 && hiddenRooms.length === 0 ? (
          <EmptyState label="Hozircha xonalar yo‘q — yuqoridagi tugma bilan qo‘shing" />
        ) : (
          <Grid>
            {rooms.map((r) => <RoomCard key={r.id} room={r} onEdit={() => setEditRoomItem(r as AdminRoom)} />)}
            {hiddenRooms.map((id) => <HiddenCard key={id} label={BASE_ROOMS.find((r) => r.id === id)?.name.uz ?? id} onRestore={() => restoreRoom(id)} />)}
          </Grid>
        )}
      </div>
    </Shell>
  );
}

function DoorCard({ leaf, onEdit }: { leaf: Leaf; onEdit: () => void }) {
  const [name, setName] = useState(leaf.name.uz);
  const builtIn = isBuiltIn(leaf.id);
  const overridden = isOverridden(leaf.id);
  // Every door can be re-cut now: a bench door reloads its data URL, a built-in
  // its bundled source — so the first four are as editable as the rest.
  const canReedit = !!leaf.source || !builtIn;
  return (
    <Card>
      <div style={{ height: THUMB_H, background: COLOR.paper, borderRadius: RADIUS_SM, overflow: 'hidden', position: 'relative' }}>
        <img src={leaf.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        {builtIn ? <span style={badge}>{overridden ? 'tahrirlangan' : 'tayyor'}</span> : <span style={badgeAdded}>qo‘shilgan</span>}
      </div>
      <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== leaf.name.uz && editLeaf(leaf.id, { name })} style={cardInput} />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {canReedit && <EditBtn onClick={onEdit} />}
        <DeleteBtn onClick={() => removeLeaf(leaf.id)} kind={overridden ? 'restore' : 'delete'} />
      </div>
    </Card>
  );
}

function RoomCard({ room, onEdit }: { room: Room; onEdit: () => void }) {
  const [name, setName] = useState(room.name.uz);
  const builtIn = isBuiltIn(room.id);
  const overridden = isRoomOverridden(room.id);
  const canReedit = !!(room as AdminRoom).source || !builtIn;
  return (
    <Card>
      <div style={{ height: THUMB_H, background: `${COLOR.panel} url(${room.thumb ?? room.image}) center 28%/cover`, borderRadius: RADIUS_SM, position: 'relative' }}>
        {builtIn ? <span style={badge}>{overridden ? 'tahrirlangan' : 'tayyor'}</span> : <span style={badgeAdded}>qo‘shilgan</span>}
      </div>
      <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== room.name.uz && editRoom(room.id, { name })} style={cardInput} />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {canReedit && <EditBtn onClick={onEdit} />}
        <DeleteBtn onClick={() => removeRoom(room.id)} kind={overridden ? 'restore' : 'delete'} />
      </div>
    </Card>
  );
}

function HiddenCard({ label, onRestore }: { label: string; onRestore: () => void }) {
  return (
    <Card>
      <div style={{ height: THUMB_H, background: COLOR.paper, borderRadius: RADIUS_SM, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLOR.inkSoft, fontSize: 13 }}>Yashirilgan</div>
      <div style={{ ...TYPE.small, color: COLOR.inkSoft, marginTop: 8 }}>{label}</div>
      <button onClick={onRestore} style={ghostBtn}>Qaytarish</button>
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
function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ position: 'fixed', inset: 0, display: 'flex', background: COLOR.paper, color: COLOR.ink, fontFamily: FONT.sans }}>{children}</div>;
}
/** Shared thumbnail height so a door card and a room card occupy the same
 *  footprint — switching tabs otherwise jumps between a tall strip and a
 *  short one, which reads as two different tools bolted together. */
const THUMB_H = 200;
function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 18 }}>{children}</div>;
}
function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: '#fff', border: `1px solid ${COLOR.line}`, borderRadius: RADIUS, padding: 12, boxShadow: '0 1px 3px rgba(35,32,27,.05)' }}>{children}</div>;
}
function EditBtn({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} style={{ ...ghostBtn, flex: 1, marginTop: 0 }}>Tahrirlash</button>;
}
function DeleteBtn({ onClick, kind }: { onClick: () => void; kind: 'delete' | 'hide' | 'restore' }) {
  const label = kind === 'delete' ? 'O‘chirish' : kind === 'restore' ? 'Aslini qaytarish' : 'Yashirish';
  return (
    <button onClick={onClick} style={{ flex: 1, padding: '9px', borderRadius: RADIUS_SM, border: `1px solid ${DANGER.border}`, background: 'transparent', color: DANGER.text, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
      {label}
    </button>
  );
}

/** A muted rust, not a bright web red — the one place the warm palette needs a
 *  "stop" colour, kept in the same family instead of a jarring foreign hue. */
const DANGER = { text: '#A6432C', border: 'rgba(166,67,44,.35)', bg: 'rgba(166,67,44,.07)' };

const pill = (on: boolean): React.CSSProperties => ({
  padding: '9px 18px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: on ? 600 : 400, fontFamily: 'inherit',
  background: on ? COLOR.ink : 'transparent', color: on ? COLOR.onInk : COLOR.inkSoft,
});
const primaryBtn: React.CSSProperties = { padding: '11px 20px', borderRadius: RADIUS, border: 'none', background: COLOR.ink, color: COLOR.onInk, fontWeight: 600, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' };
const ghostBtn: React.CSSProperties = { width: '100%', marginTop: 10, padding: '9px', borderRadius: RADIUS_SM, border: `1px solid ${COLOR.lineStrong}`, background: 'transparent', color: COLOR.ink, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' };
const cardInput: React.CSSProperties = { width: '100%', marginTop: 10, padding: '7px 9px', borderRadius: RADIUS_SM, background: COLOR.paper, color: COLOR.ink, border: `1px solid ${COLOR.line}`, fontSize: 13, fontFamily: 'inherit' };
const badge: React.CSSProperties = { position: 'absolute', top: 6, left: 6, ...TYPE.label, fontSize: 10, color: COLOR.ink, background: 'rgba(255,255,255,.88)', padding: '3px 8px', borderRadius: 999 };
/** A bench-added item never gets `badge` (that's reserved for built-ins) — it
 *  otherwise carries no marker at all, so "tayyor / tahrirlangan / qo'shilgan"
 *  reads as three states only by IMPLIED absence. This makes it explicit. */
const badgeAdded: React.CSSProperties = { ...badge, color: COLOR.onInk, background: 'rgba(143,113,69,.92)' };
