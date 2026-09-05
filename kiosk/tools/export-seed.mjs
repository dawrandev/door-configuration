/**
 * Export the compiled-in catalogue as JSON for the backend's seeder.
 *
 *   node tools/export-seed.mjs
 *
 * Run once, when the backend is first seeded, and again only if the offline
 * pipelines regenerate a built-in. The output is committed, so the backend never
 * has to reach into the frontend's source at seed time — and a fresh `php
 * artisan db:seed` on a server with no Node still works.
 *
 * Generated rather than hand-transcribed: four leaves, five rooms and eight
 * colours is small enough to type out and exactly big enough to fat-finger a
 * `corners` array in, which would keystone a door with nothing to show for it.
 *
 * The .ts imports work because Node strips types natively and every import in
 * those files is `import type`, which is erased entirely.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { LEAVES } from '../src/catalog/leaves.generated.ts';
import { ROOMS } from '../src/catalog/rooms.generated.ts';
import { TRIMS } from '../src/catalog/trims.generated.ts';
import { COLORS } from '../src/catalog/colors.ts';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(TOOLS, '../..');
const OUT = path.join(REPO, 'backend/database/seeders/data');

fs.mkdirSync(OUT, { recursive: true });

/** Written with a trailing newline and two-space indent so a regeneration
 *  produces a reviewable diff rather than one enormous line. */
const write = (name, value) => {
  const file = path.join(OUT, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
  console.log(`${name}.json  ${Array.isArray(value) ? value.length : '?'} records`);
};

write('leaves', LEAVES);
write('rooms', ROOMS);
write('trims', TRIMS);
write('colors', COLORS);

console.log(`\n-> ${path.relative(REPO, OUT)}`);
