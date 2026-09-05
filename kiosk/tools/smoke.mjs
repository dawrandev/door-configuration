/**
 * Walk the whole showroom journey in a real browser and fail loudly if
 * anything on the way is broken.
 *
 *   npm run smoke                    # builds nothing; serves dist/ and drives it
 *   npm run smoke -- --shots _smoke  # also write a screenshot per screen
 *
 * This replaces tools/shoot.mjs, which had rotted into uselessness: it clicked
 * a door called 'Panjara' (renamed 'Romb naqsh' long ago), drove a frame axis
 * that no longer exists, and read a leads store out of an IndexedDB database
 * nothing has opened in months. It also collected console errors and then
 * exited 0 regardless, so it could not have failed even when it was correct.
 *
 * What this checks, in order of how much it would hurt to get wrong:
 *   1. no uncaught exception and no console error on any screen,
 *   2. the door actually RENDERS — an <img> with real pixels inside the stage,
 *      because a recolour that throws leaves a blank frame that a screenshot
 *      cannot distinguish from a dark door,
 *   3. every step is reachable and the journey ends on the summary.
 *
 * It is deliberately not a CI gate: it needs a browser binary
 * (`npx playwright install chromium`, once) that CI deliberately skips.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const KIOSK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt === -1 ? null : path.resolve(KIOSK, process.argv[shotsAt + 1] ?? '_smoke');
const PORT = 4173;

if (!fs.existsSync(path.join(KIOSK, 'dist/index.html'))) {
  console.error('dist/ is empty — run `npm run build` first.');
  process.exit(1);
}
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

/**
 * `vite preview` serves the real build, so this drives what actually ships.
 *
 * Vite's own JS entry is run with this same Node rather than through `npx` or
 * the .bin shim. Both alternatives need `shell: true` on Windows, which
 * concatenates arguments unescaped (Node's DEP0190) and would break on a path
 * containing a space — and this repo's path has one.
 */
const server = spawn(
  process.execPath,
  [path.join(KIOSK, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: KIOSK, stdio: 'ignore' }
);
const stop = () => { try { server.kill(); } catch { /* already gone */ } };
process.on('exit', stop);

const problems = [];
let browser;

try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });

  // Console noise is the point, not a side effect: a recolour that throws
  // inside a promise shows up here and nowhere else on screen.
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`[console] ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));

  const shoot = async (name) => {
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
    console.log('  ✓', name);
  };

  // vite preview needs a moment to bind before the first request.
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle', timeout: 30_000 });

  await page.getByRole('button', { name: 'Boshlash' }).click();
  await page.waitForTimeout(600);
  await shoot('1-room');

  /**
   * Walk forward with "Davom etish" until the summary. The number of steps is
   * NOT fixed: the nalichnik and korona steps only exist once something is
   * published in those catalogues, so hardcoding four (or six) would make this
   * fail for a reason that is not a bug. The summary is identified by the one
   * control only it has.
   */
  const startOver = page.getByRole('button', { name: 'Boshidan boshlash' });
  let steps = 0;
  while (!(await startOver.isVisible()) && steps < 8) {
    await page.getByRole('button', { name: /Davom etish/ }).click();
    await page.waitForTimeout(600);
    steps++;
    await shoot(`${steps + 1}-step`);
  }
  if (!(await startOver.isVisible())) problems.push(`never reached the summary after ${steps} steps`);

  /**
   * The claim the whole project rests on: there is a door in the doorway. A
   * failed recolour resolves to no URL and leaves an <img> with no pixels,
   * which looks exactly like a dark door in a screenshot — so it is asserted
   * on naturalWidth rather than by eye.
   */
  const stageImages = await page.evaluate(() =>
    [...document.querySelectorAll('.dc-stage img')].map((im) => im.naturalWidth)
  );
  const drawn = stageImages.filter((w) => w > 0).length;
  if (drawn < 2) problems.push(`the stage drew ${drawn} image(s); expected the room and a door`);

  await browser.close();
} catch (e) {
  problems.push(`[threw] ${e.message}`);
  if (browser) await browser.close().catch(() => {});
}

stop();

if (problems.length) {
  console.error('\nFAILED:');
  for (const p of [...new Set(problems)]) console.error('  ' + p);
  process.exit(1);
}
console.log('\nsmoke OK — walked the journey with no console errors and a drawn door');
