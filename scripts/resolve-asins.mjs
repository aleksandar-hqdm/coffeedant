// Resolve each review's Amazon buy link (mostly amzn.to short links) to an ASIN,
// so the weekly price refresh can look products up. No API keys needed.
// Resumable: caches results in src/data/asins.json. Usage: node scripts/resolve-asins.mjs [--limit N]
import fs from 'node:fs';

const DIR = 'src/content/pages';
const OUT = 'src/data/asins.json';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

const cache = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const pages = fs.readdirSync(DIR).map((f) => JSON.parse(fs.readFileSync(DIR + '/' + f, 'utf8')));
const li = process.argv.indexOf('--limit');
const limit = li > -1 ? Number(process.argv[li + 1]) : Infinity;

const asinFrom = (u) =>
  (u.match(/\/dp\/([A-Z0-9]{10})/) || u.match(/\/gp\/product\/([A-Z0-9]{10})/) || u.match(/\/dp\/product\/([A-Z0-9]{10})/) || [])[1] || null;

const targets = pages.filter((p) => (p.asin || p.amazonUrl) && !cache[p.slug]).slice(0, limit);
let resolved = 0;
for (const p of targets) {
  let asin = p.asin || asinFrom(p.amazonUrl || '');
  if (!asin && /amzn\.to/.test(p.amazonUrl || '')) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000);
    try {
      const r = await fetch(p.amazonUrl, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: ac.signal });
      asin = asinFrom(r.url) || asinFrom(await r.text().catch(() => ''));
    } catch (e) {
      console.error('fail', p.slug, e.message);
    } finally {
      clearTimeout(t);
    }
    await new Promise((r) => setTimeout(r, 400)); // be polite
  }
  if (asin) { cache[p.slug] = asin; resolved++; console.log(p.slug, '->', asin); }
  else console.log(p.slug, '-> (unresolved)');
}
fs.writeFileSync(OUT, JSON.stringify(cache, null, 1));
console.log(`\nresolved ${resolved} this run | ${Object.keys(cache).length} total cached`);
