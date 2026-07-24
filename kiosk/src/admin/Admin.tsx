import { useEffect, useState } from 'react';
import { COLOR, FONT, RADIUS, TYPE } from '../design/tokens';
import { LEAVES as BASE_LEAVES } from '../catalog/leaves.generated';
import { ROOMS as BASE_ROOMS } from '../catalog/rooms.generated';
import type { Leaf, Room } from '../catalog/types';
import { DoorBench, Seg } from './DoorBench';
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 6, background: '#232120', border: '1px solid #3a3733', borderRadius: 999, padding: 4 }}>
            {(['doors', 'rooms'] as Tab[]).map((t) => (
              <button key={t} onClick={() => setTab(t)} style={pill(tab === t)}>{t === 'doors' ? `Eshiklar (${leaves.length})` : `Xonalar (${rooms.length})`}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <a href="#/" style={{ color: '#9d9790', fontSize: 13, textDecoration: 'none' }}>Client sayt →</a>
            <button onClick={() => setAdding(true)} style={{ padding: '11px 20px', borderRadius: RADIUS, border: 'none', background: COLOR.brass, color: '#1b1a18', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
              + {tab === 'doors' ? 'Yangi eshik' : 'Yangi xona'}
            </button>
          </div>
        </div>

        {tab === 'doors' ? (
          <Grid>
            {leaves.map((l) => <DoorCard key={l.id} leaf={l} onEdit={() => setEditLeafItem(l as AdminLeaf)} />)}
            {hiddenLeaves.map((id) => <HiddenCard key={id} label={BASE_LEAVES.find((l) => l.id === id)?.name.uz ?? id} onRestore={() => restoreLeaf(id)} />)}
          </Grid>
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
      <div style={{ aspectRatio: String(Math.max(0.3, leaf.aspect)), background: '#efece6', borderRadius: 8, overflow: 'hidden', position: 'relative' }}>
        <img src={leaf.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        {builtIn && <span style={badge}>{overridden ? 'tahrirlangan' : 'tayyor'}</span>}
      </div>
      <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== leaf.name.uz && editLeaf(leaf.id, { name })} style={cardInput} />
      <div style={{ fontSize: 11, color: '#8f8a83', margin: '8px 0 5px' }}>Tutqich</div>
      <Seg
        opts={[{ id: 'left', label: 'Chap' }, { id: 'right', label: 'O‘ng' }, { id: 'none', label: 'Yo‘q' }]}
        value={leaf.handleSwappable ? leaf.handleSide : 'none'}
        onPick={(v) => editLeaf(leaf.id, { handleSide: v as 'left' | 'right' | 'none' })}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {canReedit && <EditBtn onClick={onEdit} />}
        <DeleteBtn onClick={() => removeLeaf(leaf.id)} kind={!builtIn ? 'delete' : overridden ? 'restore' : 'hide'} />
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
      <div style={{ aspectRatio: '1.2', background: `#ddd6c8 url(${room.image}) center 28%/cover`, borderRadius: 8, position: 'relative' }}>
        {builtIn && <span style={badge}>{overridden ? 'tahrirlangan' : 'tayyor'}</span>}
      </div>
      <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== room.name.uz && editRoom(room.id, { name })} style={cardInput} />
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        {canReedit && <EditBtn onClick={onEdit} />}
        <DeleteBtn onClick={() => removeRoom(room.id)} kind={!builtIn ? 'delete' : overridden ? 'restore' : 'hide'} />
      </div>
    </Card>
  );
}

function HiddenCard({ label, onRestore }: { label: string; onRestore: () => void }) {
  return (
    <Card>
      <div style={{ aspectRatio: '1.2', background: '#1b1a18', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5c574f', fontSize: 13 }}>Yashirilgan</div>
      <div style={{ ...TYPE.small, color: '#9d9790', marginTop: 8 }}>{label}</div>
      <button onClick={onRestore} style={{ width: '100%', marginTop: 10, padding: '9px', borderRadius: RADIUS, border: '1px solid #454039', background: 'transparent', color: '#cfcac3', cursor: 'pointer', fontSize: 13 }}>Qaytarish</button>
    </Card>
  );
}

// ---- chrome ----
function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ position: 'fixed', inset: 0, display: 'flex', background: '#1b1a18', color: '#efece6', fontFamily: FONT.sans }}>{children}</div>;
}
function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 18 }}>{children}</div>;
}
function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: '#232120', border: '1px solid #3a3733', borderRadius: RADIUS, padding: 12 }}>{children}</div>;
}
function EditBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ flex: 1, padding: '9px', borderRadius: RADIUS, border: '1px solid #454039', background: 'transparent', color: '#cfcac3', cursor: 'pointer', fontSize: 13 }}>
      Tahrirlash
    </button>
  );
}
function DeleteBtn({ onClick, kind }: { onClick: () => void; kind: 'delete' | 'hide' | 'restore' }) {
  const label = kind === 'delete' ? 'O‘chirish' : kind === 'restore' ? 'Aslini qaytarish' : 'Yashirish';
  return (
    <button onClick={onClick} style={{ flex: 1, padding: '9px', borderRadius: RADIUS, border: '1px solid #5a3a3a', background: 'transparent', color: '#e08a8a', cursor: 'pointer', fontSize: 13 }}>
      {label}
    </button>
  );
}
const pill = (on: boolean): React.CSSProperties => ({ padding: '9px 18px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: on ? 600 : 400, background: on ? COLOR.brass : 'transparent', color: on ? '#1b1a18' : '#cfcac3' });
const cardInput: React.CSSProperties = { width: '100%', marginTop: 10, padding: '7px 9px', borderRadius: 6, background: '#1b1a18', color: '#efece6', border: '1px solid #454039', fontSize: 13, fontFamily: 'inherit' };
const badge: React.CSSProperties = { position: 'absolute', top: 6, left: 6, fontSize: 10, letterSpacing: '.06em', color: '#1b1a18', background: 'rgba(232,236,230,.85)', padding: '2px 7px', borderRadius: 999 };
