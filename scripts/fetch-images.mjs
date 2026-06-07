// Download every coffeedant.com/wp-content/uploads image referenced by the site
// into public/images (preserving the subpath), so images survive DNS cutover.
// Resumable (skips existing). Usage: node scripts/fetch-images.mjs [--dry]
import fs from 'node:fs';
import path from 'node:path';

const DRY = process.argv.includes('--dry');
const UPLOADS = /https?:\/\/coffeedant\.com\/wp-content\/uploads\/[^\s"'<>)\\]+?\.(?:jpe?g|png|gif|webp|svg|avif)/gi;
const UA = 'Mozilla/5.0 (coffeedant-migrate)';

// ---- collect referenced URLs from content + data ------------------------------
const urls = new Set();
function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) scanDir(fp);
    else if (e.name.endsWith('.json')) {
      const text = fs.readFileSync(fp, 'utf8');
      for (const m of text.matchAll(UPLOADS)) urls.add(m[0].split('?')[0]);
    }
  }
}
scanDir('src/content/pages');
scanDir('src/data');

const list = [...urls];
const localOf = (u) => 'public/images/' + u.split('/wp-content/uploads/')[1];
console.log(`referenced images: ${list.length}`);
if (DRY) {
  const missing = list.filter((u) => !fs.existsSync(localOf(u)));
  console.log(`already downloaded: ${list.length - missing.length} | to fetch: ${missing.length}`);
  console.log('sample:', list.slice(0, 4).map((u) => u.split('/wp-content/uploads/')[1]));
  process.exit(0);
}

// ---- download with a small concurrency pool -----------------------------------
let done = 0, skipped = 0, failed = 0, bytes = 0;
const fail = [];
async function grab(u) {
  const out = localOf(u);
  if (fs.existsSync(out)) { skipped++; return; }
  try {
    const res = await fetch(u, { headers: { 'User-Agent': UA } });
    if (!res.ok) { failed++; fail.push(`${res.status} ${u}`); return; }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, buf);
    done++; bytes += buf.length;
  } catch (e) { failed++; fail.push(`ERR ${e.message} ${u}`); }
}

const POOL = 3;
let i = 0;
async function worker() {
  while (i < list.length) {
    const u = list[i++];
    await grab(u);
    await new Promise((r) => setTimeout(r, 350)); // gentle: the WP host rate-limits
    if ((done + skipped + failed) % 25 === 0) process.stdout.write('.');
  }
}
await Promise.all(Array.from({ length: POOL }, worker));
console.log(`\ndownloaded ${done} (${(bytes / 1024 / 1024).toFixed(1)} MB) | skipped ${skipped} | failed ${failed}`);
fail.slice(0, 10).forEach((f) => console.log('  ', f));
