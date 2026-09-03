// Built-in seed for nalichnik/korona designs. Unlike rooms.generated.ts and
// leaves.generated.ts, there is no offline tools/trims.mjs pipeline — a
// TrimModel is entirely authored client-side through admin/TrimBench.tsx
// (mark corners, open a margin, trace pieces), the same way every bench-
// added door or room already is. Empty until staff publish the first one.
import type { TrimModel } from './types';

export const TRIMS: TrimModel[] = [];
