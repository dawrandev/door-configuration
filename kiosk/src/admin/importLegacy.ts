import { addColor, getAdminCatalog, publishLeaf, publishRoom, publishTrim, renameItem, dataUrlToBlob, type LeafPayload } from '../api/catalog';
import type { Leaf, Room, TrimModel, TrimRole } from '../catalog/types';
import type { DoorColor } from '../catalog/colors';

/**
 * Carry a bench that predates the backend across to it, once.
 *
 * Before this the catalogue lived in whichever browser cut it, so a workshop
 * that had been publishing for weeks has doors that exist nowhere else. Losing
 * them to the migration would be the migration's own fault, so this reads the
 * old drawers and republishes every record through the API.
 *
 * Deliberately NOT automatic. It runs when someone presses the button, and it
 * leaves the old keys where they are: an import that quietly rewrote a shared
 * catalogue the first time a stale laptop opened the bench would be far worse
 * than one that has to be asked for.
 */

const K = {
  leaves: 'dc.leaves.v1',
  leafEdits: 'dc.leafedits.v1',
  rooms: 'dc.rooms.v1',
  roomEdits: 'dc.roomedits.v1',
  colors: 'dc.colors.v1',
  trims: 'dc.trims.v1',
  trimEdits: 'dc.trimedits.v1',
  /** Set once this browser's drawers have been sent. The originals are left
   *  untouched, so this is the only thing standing between a second press and
   *  a second copy of every door — bench ids are minted server-side, so a
   *  re-import cannot recognise its own earlier work. */
  done: 'dc.imported.v1',
} as const;

type LegacyLeaf = Leaf & { image: string; source?: string; corners?: { x: number; y: number }[]; white?: boolean; handleChoice?: 'left' | 'right' | 'none' };
type LegacyRoom = Room & { source?: string; box?: { x: number; y: number; w: number; h: number } };
type LegacyTrim = TrimModel & { source?: string; corners?: { x: number; y: number }[] };
type LegacyEdit = { name?: string; hidden?: boolean };

function read<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null');
    return (v ?? fallback) as T;
  } catch {
    return fallback;
  }
}

/** What is sitting in this browser, without touching it. */
export function legacyCount(): number {
  if (localStorage.getItem(K.done)) return 0;
  return (
    read<LegacyLeaf[]>(K.leaves, []).length +
    read<LegacyRoom[]>(K.rooms, []).length +
    read<LegacyTrim[]>(K.trims, []).length +
    read<DoorColor[]>(K.colors, []).length
  );
}

export interface ImportReport {
  colors: number;
  rooms: number;
  leaves: number;
  trims: number;
  renamed: number;
  /** Records that could not be sent, with the reason. Reported rather than
   *  thrown: one bad row must not strand the rest. */
  failed: { kind: string; id: string; why: string }[];
  /** Items the old bench had hidden. Not acted on — hiding things during an
   *  import is exactly the surprise nobody wants — but worth naming. */
  wasHidden: string[];
}

const why = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Which id to publish under, if any.
 *
 * A record that carries a BUILT-IN's id is a re-cut of something the server
 * already seeded, and has to replace it — publishing it fresh would leave the
 * original beside its own replacement. A bench record's id, on the other hand,
 * was minted by the old browser and means nothing here, so the server mints
 * its own. Nothing outside the catalogue refers to these ids: a customer's
 * picks live for one session.
 */
const replacing = (id: string) => (id.startsWith('a-') ? undefined : id);

export async function importLegacy(onStep?: (msg: string) => void): Promise<ImportReport> {
  const r: ImportReport = { colors: 0, rooms: 0, leaves: 0, trims: 0, renamed: 0, failed: [], wasHidden: [] };
  const step = (m: string) => onStep?.(m);

  // What the server already holds, so a shade that is plainly the same one is
  // not mixed twice. Ids cannot be compared: the server mints its own.
  const existing = await getAdminCatalog().catch(() => null);
  const knownHex = new Set((existing?.colors ?? []).map((c) => c.hex.toLowerCase()));

  // Colours first: a door about to be imported may list one of them.
  for (const c of read<DoorColor[]>(K.colors, [])) {
    if (knownHex.has(c.hex.toLowerCase())) continue;
    try {
      await addColor({ id: c.id, name: c.name, hex: c.hex });
      knownHex.add(c.hex.toLowerCase());
      r.colors++;
    } catch (e) {
      r.failed.push({ kind: 'color', id: c.id, why: why(e) });
    }
  }
  step(`Ranglar: ${r.colors}`);

  for (const room of read<LegacyRoom[]>(K.rooms, [])) {
    try {
      await publishRoom(
        {
          room: {
            name: room.name,
            aspect: room.aspect,
            open: room.open,
            light: room.light,
            trimBoxes: room.trimBoxes,
            box: room.box,
          },
        },
        {
          image: dataUrlToBlob(room.image),
          thumb: room.thumb?.startsWith('data:') ? dataUrlToBlob(room.thumb) : undefined,
          source: room.source?.startsWith('data:') ? dataUrlToBlob(room.source) : undefined,
        },
        replacing(room.id)
      );
      r.rooms++;
    } catch (e) {
      r.failed.push({ kind: 'room', id: room.id, why: why(e) });
    }
  }
  step(`Xonalar: ${r.rooms}`);

  for (const leaf of read<LegacyLeaf[]>(K.leaves, [])) {
    try {
      const payload: LeafPayload = {
        leaf: {
          name: leaf.name,
          aspect: leaf.aspect,
          handleSide: leaf.handleSide ?? 'left',
          handleSwappable: !!leaf.handleSwappable,
          handleAt: leaf.handleAt ?? null,
          white: leaf.white ?? true,
          handleChoice: leaf.handleChoice ?? 'none',
          corners: leaf.corners ?? [],
          // The old records said "all colours" by leaving the field out; the
          // backend says it with a mode, because an empty list is a different
          // statement.
          colorMode: leaf.colorIds ? 'list' : 'all',
          colorIds: leaf.colorIds,
          trimRoleMode: leaf.trimRoles ? 'list' : 'all',
          trimRoles: leaf.trimRoles as TrimRole[] | undefined,
        },
      };
      await publishLeaf(
        payload,
        {
          image: dataUrlToBlob(leaf.image),
          source: leaf.source?.startsWith('data:') ? dataUrlToBlob(leaf.source) : undefined,
        },
        replacing(leaf.id)
      );
      r.leaves++;
    } catch (e) {
      r.failed.push({ kind: 'leaf', id: leaf.id, why: why(e) });
    }
  }
  step(`Eshiklar: ${r.leaves}`);

  /*
   * Designs go over as standalone entries, even the ones the old bench tied to
   * a door through its id. Their pictures were separate records there, and
   * re-attaching them would mean picking ONE of the two as the shared photo —
   * which silently rewrites the other if they ever diverged. The designs stay
   * pickable either way; only "reopen this door and nudge its outlines" is
   * lost, for doors imported from before the move.
   */
  for (const trim of read<LegacyTrim[]>(K.trims, [])) {
    try {
      await publishTrim(
        {
          trim: {
            name: trim.name,
            category: trim.category,
            trimMargin: trim.trimMargin,
            trimBoxes: trim.trimBoxes,
            corners: trim.corners,
          },
        },
        {
          trimSource: dataUrlToBlob(trim.trimSource),
          source: trim.source?.startsWith('data:') ? dataUrlToBlob(trim.source) : undefined,
        },
        replacing(trim.id)
      );
      r.trims++;
    } catch (e) {
      r.failed.push({ kind: 'trim', id: trim.id, why: why(e) });
    }
  }
  step(`Nalichniklar: ${r.trims}`);

  // Renames of built-ins lived in their own drawer, since a generated
  // catalogue could not be edited in place. On the server they are just a
  // column, so they replay as renames.
  const edits: [string, Record<string, LegacyEdit>][] = [
    ['leaves', read<Record<string, LegacyEdit>>(K.leafEdits, {})],
    ['rooms', read<Record<string, LegacyEdit>>(K.roomEdits, {})],
    ['trims', read<Record<string, LegacyEdit>>(K.trimEdits, {})],
  ];
  for (const [kind, bag] of edits) {
    for (const [id, edit] of Object.entries(bag)) {
      if (edit.hidden) r.wasHidden.push(`${kind}/${id}`);
      if (!edit.name) continue;
      try {
        await renameItem(kind as 'leaves' | 'rooms' | 'trims', id, { uz: edit.name, kk: edit.name, ru: edit.name });
        r.renamed++;
      } catch (e) {
        r.failed.push({ kind: kind + ' rename', id, why: why(e) });
      }
    }
  }

  // Only after everything has been attempted: a run that half-failed can be
  // repeated, and the report says which rows to expect twice.
  localStorage.setItem(K.done, new Date().toISOString());
  return r;
}
