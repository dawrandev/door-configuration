/**
 * Shoots the flow at three device widths, so the reflow can be judged without a
 * pile of physical devices. Mobile portrait, tablet portrait, desktop landscape.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.argv[2];
const OUT = process.argv[3];
fs.mkdirSync(OUT, { recursive: true });

const DEVICES = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 900 },
];

const browser = await chromium.launch();

for (const d of DEVICES) {
  const page = await browser.newPage({ viewport: { width: d.width, height: d.height } });
  const problems = [];
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`[error] ${m.text()}`);
  });

  await page.goto(URL, { waitUntil: 'networkidle' });
  const shoot = async (name) => {
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${d.name}-${name}.png` });
  };

  await shoot('1-attract');
  await page.getByRole('button', { name: 'Boshlash' }).click();
  await shoot('2-wall');
  await page.getByRole('button', { name: /Davom etish/ }).click();
  await shoot('3-door');
  await page.getByRole('button', { name: /Davom etish/ }).click();
  await shoot('4-customize');
  await page.getByRole('button', { name: /Davom etish/ }).click();
  await shoot('5-summary');

  console.log(`${d.name} (${d.width}×${d.height}):`, problems.length ? problems.join(' | ') : 'clean');
  await page.close();
}

await browser.close();
