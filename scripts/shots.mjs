// Headless screenshot capture for design review (the preview MCP rasterizer is wedged).
// Usage: node scripts/shots.mjs [baseURL]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] || 'http://localhost:8788';
const OUT = 'C:/tmp/cd-shots';
mkdirSync(OUT, { recursive: true });

const PAGES = [
  ['home',    '/'],
  ['machines','/machines/'],
  ['quiz',    '/quiz/'],
  ['compare', '/compare/'],
  ['brand',   '/brand/breville/'],
  ['review',  '/espresso-machine/delonghi-magnifica-start/'],
];
const VIEWPORTS = [['desktop', 1440, 950], ['mobile', 390, 844]];

const browser = await chromium.launch();
for (const [vname, w, h] of VIEWPORTS) {
  // deviceScaleFactor 1 keeps very tall full-page captures under Chromium's limit
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const [name, path] of PAGES) {
    try {
      await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 45000 });
      await page.evaluate(() => document.fonts.ready);
      // force scroll-reveal sections visible so full-page shots aren't blank
      await page.evaluate(() => document.querySelectorAll('.reveal').forEach((e) => e.classList.add('is-in')));
      await page.waitForTimeout(500);
      // full page
      await page.screenshot({ path: `${OUT}/${name}-${vname}.jpg`, type: 'jpeg', quality: 82, fullPage: true });
      // above-the-fold for desktop home/review
      if (vname === 'desktop' && (name === 'home' || name === 'review' || name === 'quiz')) {
        await page.screenshot({ path: `${OUT}/${name}-${vname}-fold.jpg`, type: 'jpeg', quality: 82, fullPage: false });
      }
      console.log('shot', name, vname);
    } catch (e) {
      console.log('FAIL', name, vname, e.message);
    }
  }
  await ctx.close();
}
await browser.close();
console.log('DONE ->', OUT);
