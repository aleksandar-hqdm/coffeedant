// Focused viewport captures at given scroll offsets.
// Usage: node scripts/shot1.mjs <path> <name> <y1,y2,...>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = 'http://localhost:8788';
const OUT = 'C:/tmp/cd-shots';
mkdirSync(OUT, { recursive: true });
const path = process.argv[2], name = process.argv[3];
const ys = (process.argv[4] || '0').split(',').map(Number);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 });
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => document.querySelectorAll('.reveal').forEach((e) => e.classList.add('is-in')));
for (let i = 0; i < ys.length; i++) {
  await page.evaluate((y) => window.scrollTo(0, y), ys[i]);
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${name}-${i}.jpg`, type: 'jpeg', quality: 85 });
  console.log('shot', name, i, '@', ys[i]);
}
await browser.close();
