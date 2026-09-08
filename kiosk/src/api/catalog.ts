import { api, type ApiInit } from './http';
import type { Leaf, Room, TrimModel, TrimPiece, TrimRole } from '../catalog/types';
import type { DoorColor } from '../catalog/colors';

/**
 * Every endpoint the SPA has, in one file.
 *
 * There is no repository or service layer on this side and there should not
 * be: these are eleven calls against a catalogue the backend already models
 * properly. The types below are the client half of the contract that
 * `backend/app/Http/Resources` fills — if one moves, both move.
 */

/** What the showroom reads. Shapes match `catalog/types.ts` field for field. */
export interface Catalog {
  version: string;
  leaves: Leaf[];
  rooms: Room[];
  trims: TrimModel[];
  colors: DoorColor[];
}

/**
 * What the bench reads: the same catalogue plus everything needed to reopen an
 * item and re-cut it, and the hidden ones the showroom is not shown.
 */
export type AdminLeaf = Leaf & {
  source?: string;
  corners?: { x: number; y: number }[];
  white: boolean;
  handleChoice: 'left' | 'right' | 'none';
  colorMode: 'all' | 'list';
  trimRoleMode: 'all' | 'list';
  origin: 'builtin' | 'bench';
  overridden: boolean;
  hidden: boolean;
  position: number;
  trims?: { id: string; category: 'nalichnik' | 'korona' }[];
  updatedAt?: string;
};
export type AdminRoom = Room & {
  source?: string;
  box?: { x: number; y: number; w: number; h: number };
  origin: 'builtin' | 'bench';
  overridden: boolean;
  hidden: boolean;
  position: number;
  updatedAt?: string;
};
export type AdminTrim = TrimModel & {
  source?: string;
  corners?: { x: number; y: number }[];
  ownerLeafId?: string | null;
  origin: 'builtin' | 'bench';
  overridden: boolean;
  hidden: boolean;
  position: number;
  updatedAt?: string;
};

export interface AdminCatalog {
  version: string;
  leaves: AdminLeaf[];
  rooms: AdminRoom[];
  trims: AdminTrim[];
  colors: DoorColor[];
}

export type ItemKind = 'leaves' | 'rooms' | 'trims';

/** A name in all three languages — every catalogue item carries one. */
export interface Tr { uz: string; kk: string; ru: string }

// ---- the showroom ----

export const getCatalog = () => api<Catalog>('catalog') as Promise<Catalog>;

/**
 * Just the version, for polling. The showroom and the bench are often not even
 * the same machine — that is the entire point of moving off localStorage — so
 * "the bench published something" can no longer be a same-tab event.
 */
export const getCatalogVersion = () => api<{ version: string }>('catalog/version') as Promise<{ version: string }>;

// ---- the bench's own session ----

export const login = (email: string, password: string) =>
  api<null>('auth/login', { method: 'POST', body: { email, password } });

export const logout = () => api<null>('auth/logout', { method: 'POST' });

export const me = () => api<{ id: number; name: string; email: string }>('auth/me');

// ---- the bench ----

export const getAdminCatalog = (init?: ApiInit) =>
  api<AdminCatalog>('admin/catalog', init);

/**
 * Publishing sends ONE multipart request: the geometry as a JSON `payload`
 * field, the pictures as files beside it. It is one request because the
 * backend writes a door and both its trim designs in a single transaction —
 * splitting it into three would make a half-published door reachable.
 */
export interface LeafPayload {
  leaf: {
    name: Tr;
    aspect: number;
    handleSide: 'left' | 'right';
    handleSwappable: boolean;
    handleAt?: { x: number; y: number } | null;
    white: boolean;
    handleChoice: 'left' | 'right' | 'none';
    corners: { x: number; y: number }[];
    colorMode: 'all' | 'list';
    colorIds?: string[];
    trimRoleMode: 'all' | 'list';
    trimRoles?: TrimRole[];
    keep?: { x: number; y: number; w: number; h: number }[] | null;
  };
  trims?: {
    category: 'nalichnik' | 'korona';
    name: Tr;
    trimMargin: { left: number; right: number; top: number; bottom: number };
    trimBoxes: TrimPiece[];
    corners?: { x: number; y: number }[];
  }[];
}

export interface LeafFiles {
  image?: Blob;
  source?: Blob;
  trimSource?: Blob;
}

function multipart(payload: unknown, files: object): FormData {
  const form = new FormData();
  form.append('payload', JSON.stringify(payload));
  for (const [name, blob] of Object.entries(files)) {
    // A filename is required or PHP does not populate $_FILES for the part.
    if (blob instanceof Blob) form.append(name, blob, name + '.bin');
  }
  return form;
}

/** `id` given re-cuts that door in place; omitted mints a new one. */
export const publishLeaf = (payload: LeafPayload, files: LeafFiles, id?: string) =>
  api<AdminLeaf>(id ? `admin/leaves/${id}` : 'admin/leaves', { method: 'POST', form: multipart(payload, files) });

export interface RoomPayload {
  room: {
    name: Tr;
    aspect: number;
    open: { x: number; y: number; w: number; h: number };
    light: [number, number, number];
    trimBoxes?: TrimPiece[];
    box?: { x: number; y: number; w: number; h: number };
  };
}

export const publishRoom = (payload: RoomPayload, files: { image?: Blob; thumb?: Blob; source?: Blob }, id?: string) =>
  api<AdminRoom>(id ? `admin/rooms/${id}` : 'admin/rooms', { method: 'POST', form: multipart(payload, files) });

export interface TrimPayload {
  trim: {
    name: Tr;
    category: 'nalichnik' | 'korona';
    trimMargin: { left: number; right: number; top: number; bottom: number };
    trimBoxes: TrimPiece[];
    corners?: { x: number; y: number }[];
  };
}

export const publishTrim = (payload: TrimPayload, files: { trimSource?: Blob; source?: Blob }, id?: string) =>
  api<AdminTrim>(id ? `admin/trims/${id}` : 'admin/trims', { method: 'POST', form: multipart(payload, files) });

/** Add-only by design: a shade already worn by a door is never taken away. */
export const addColor = (color: { id: string; name: Tr; hex: string }) =>
  api<DoorColor>('admin/colors', { method: 'POST', body: color });

export const renameItem = (kind: ItemKind, id: string, name: Tr) =>
  api<null>(`admin/${kind}/${id}`, { method: 'PATCH', body: { name } });

/** Deletes a bench item outright; a built-in is hidden instead, since its
 *  pixels ship with the app and there is nothing to delete. */
export const deleteItem = (kind: ItemKind, id: string) =>
  api<null>(`admin/${kind}/${id}`, { method: 'DELETE' });

export const unhideItem = (kind: ItemKind, id: string) =>
  api<null>(`admin/${kind}/${id}/unhide`, { method: 'POST' });

export const getDiagnostics = () => api<unknown>('admin/diagnostics');
