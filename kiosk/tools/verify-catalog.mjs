/**
 * Compare what the backend serves against what the frontend used to compile in.
 *
 *   node tools/verify-catalog.mjs [http://127.0.0.1:8000]
 *
 * This is the check the whole migration rests on. Every later phase assumes the
 * two shapes match; a mismatch found after the client has been switched over is
 * a rewrite, and a mismatch NOT found is a showroom that renders subtly wrong
 * doors with nothing in the console.
 *
 * Image paths are expected to differ — the frontend served /assets/..., the
 * backend serves /storage/catalog/... with a content hash — so those are
 * compared by shape (both non-empty strings) rather than by value. Bench-only
 * fields (source, corners, white, handleChoice) are dropped: the public endpoint
 * deliberately omits them, and the showroom never read them.
 */
import { LEAVES } from '../src/catalog/leaves.generated.ts';
import { ROOMS } from '../src/catalog/rooms.generated.ts';
import { TRIMS } from '../src/catalog/trims.generated.ts';
import { COLORS } from '../src/catalog/colors.ts';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8000';

/** Fields the public API drops on purpose, per list. */
const BENCH_ONLY = {
  leaves: ['source', 'corners', 'white', 'handleChoice'],
  rooms: ['source', 'box'],
  trims: ['source', 'corners'],
  colors: [],
};

/** Fields whose VALUE is expected to differ (a URL), but whose presence is not. */
const URL_FIELDS = {
  leaves: ['image'],
  rooms: ['image', 'thumb'],
  trims: ['trimSource'],
  colors: [],
};

const problems = [];

/**
 * Stringify with object keys sorted, ARRAY order left alone.
 *
 * MySQL's JSON type stores objects as a sorted map, so `{x, y, w, h}` comes back
 * as `{h, w, x, y}`. That is not a difference — nothing reads these positionally
 * — and a plain JSON.stringify comparison would report every rectangle in the
 * catalogue as a mismatch.
 *
 * Array order is emphatically NOT normalised. A trim piece's `points` are a
 * closed polygon whose winding direction the renderer computes from the sequence
 * (signedArea / windLike in recolor.ts); reordering them would flip a cutout
 * inside out. If the database ever returns those in a different order, this
 * check must fail.
 */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function compare(list, expected, actual) {
  if (expected.length !== actual.length) {
    problems.push(`${list}: ${expected.length} expected, ${actual.length} served`);
    return;
  }

  expected.forEach((want, i) => {
    const got = actual[i];
    if (want.id !== got.id) {
      problems.push(`${list}[${i}]: id ${want.id} expected, ${got.id} served (order differs)`);
      return;
    }

    const drop = new Set(BENCH_ONLY[list]);
    const urls = new Set(URL_FIELDS[list]);
    const keys = new Set([
      ...Object.keys(want).filter((k) => !drop.has(k)),
      ...Object.keys(got),
    ]);

    for (const key of keys) {
      const inWant = key in want && want[key] !== undefined;
      const inGot = key in got && got[key] !== undefined;

      // Presence must match exactly — an absent colorIds means "every colour,
      // including later ones", which is NOT the same as any array value.
      if (inWant !== inGot) {
        problems.push(`${list}[${want.id}].${key}: ${inWant ? 'expected but not served' : 'served but not expected'}`);
        continue;
      }
      if (!inWant) continue;

      if (urls.has(key)) {
        if (typeof got[key] !== 'string' || got[key] === '') {
          problems.push(`${list}[${want.id}].${key}: not a usable URL (${JSON.stringify(got[key])})`);
        }
        continue;
      }

      const a = canonical(want[key]);
      const b = canonical(got[key]);
      if (a !== b) problems.push(`${list}[${want.id}].${key}: ${a} expected, ${b} served`);
    }
  });
}

const res = await fetch(`${BASE}/api/catalog`);
if (!res.ok) {
  console.error(`GET ${BASE}/api/catalog -> ${res.status}`);
  process.exit(1);
}
const served = await res.json();

compare('leaves', LEAVES, served.leaves);
compare('rooms', ROOMS, served.rooms);
compare('trims', TRIMS, served.trims);
compare('colors', COLORS, served.colors);

if (problems.length) {
  console.error(`\n${problems.length} mismatch(es):\n`);
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}

console.log(
  `catalogue matches: ${served.leaves.length} doors, ${served.rooms.length} rooms, ` +
  `${served.trims.length} trim designs, ${served.colors.length} colours`
);
console.log(`version ${served.version}`);
