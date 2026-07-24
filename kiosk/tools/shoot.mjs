/**
 * Drives the real app in a real browser and shoots each screen.
 *
 *   node tools/shoot.mjs <url> <outDir>
 *
 * The whole project rests on whether the composite convinces on a screen, so it
 * has to be looked at on a screen. Console errors are surfaced rather than
 * swallowed: a WebGL shader that fails to link still renders a blank canvas, and
 * a blank canvas in a screenshot looks a lot like a dark door.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.argv[2];
const OUT = process.argv[3];
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });

const problems = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));

const shoot = async (name) => {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('  shot', name);
};

await page.goto(URL, { waitUntil: 'networkidle' });
await shoot('1-attract');

await page.getByRole('button', { name: 'Boshlash' }).click();
await shoot('2-wall');

await page.getByRole('button', { name: /Davom etish/ }).click();
await shoot('3-door');

// step through the carousel — this is the continuity claim: wall stays, door changes
for (const model of ['Panjara', 'Klassik panel']) {
  await page.getByRole('button', { name: model, exact: false }).first().click();
  await shoot(`3-door-${model.split(' ')[0]}`);
}

await page.getByRole('button', { name: /Davom etish/ }).click();
await shoot('4-customize');

// the finish crossfade — the thing the shader exists for
for (const finish of ["Yong'oq", 'Grafit', 'Guruch']) {
  await page.getByRole('button', { name: finish, exact: false }).first().click();
  await shoot(`4-leaf-${finish}`);
}

// two-tone: a dark leaf in a pale architrave, which the frame axis buys us
await page.getByRole('button', { name: 'Ramka rangi' }).click();
await page.getByRole('button', { name: 'Grafit', exact: false }).first().click();
await shoot('4-twotone');

await page.getByRole('button', { name: 'Ramka', exact: true }).click();
await shoot('4-frames');

await page.getByRole('button', { name: /Davom etish/ }).click();
await shoot('5-summary');

// the handoff sheet — phone capture, the part that leaves us with a lead
await page.getByRole('button', { name: /saqlab qo/ }).click();
await shoot('6-handoff');

// a saved lead: type a number, save, land on the thank-you
await page.getByPlaceholder('+998').fill('90 123 45 67');
await page.getByRole('button', { name: 'Saqlash' }).click();
await shoot('6-saved');

// confirm the lead actually made it into the offline queue
const queued = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const r = indexedDB.open('door-kiosk', 1);
      r.onsuccess = () => {
        const all = r.result.transaction('leads', 'readonly').objectStore('leads').getAll();
        all.onsuccess = () => resolve(all.result);
      };
      r.onerror = () => resolve('open-failed');
    })
);
console.log('  queued leads:', JSON.stringify(queued));

await browser.close();

if (problems.length) {
  console.log('\nconsole output:');
  for (const p of [...new Set(problems)]) console.log('  ' + p);
} else {
  console.log('\nno console errors');
}
