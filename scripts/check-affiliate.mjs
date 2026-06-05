// Verify every amazon.com link in the built site carries our Associates tag.
import fs from 'node:fs';
import path from 'node:path';

const TAG = 'coffeedant03-20';
const URL_RE = /https?:\/\/(?:www\.)?amazon\.com\/[^\s"<>]*/gi;
let total = 0, untagged = 0;
const bad = new Set();

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) walk(fp);
    else if (e.name.endsWith('.html')) {
      const html = fs.readFileSync(fp, 'utf8');
      for (const m of html.matchAll(URL_RE)) {
        total++;
        if (!new RegExp(`[?&]tag=${TAG}(?:&|$)`).test(m[0])) {
          untagged++;
          if (bad.size < 8) bad.add(m[0]);
        }
      }
    }
  }
}

walk('dist');
console.log(`amazon.com links in dist -> total: ${total} | untagged: ${untagged}`);
for (const u of bad) console.log('UNTAGGED:', u);
if (untagged > 0) process.exit(1);
