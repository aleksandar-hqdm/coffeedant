// Probe: what machine "category" / type info can we extract for the quiz?
import fs from 'node:fs';
const dir = 'src/content/pages';
const ps = fs.readdirSync(dir).map((f) => JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8'))).filter((p) => p.type === 'review');
const cat = (p) => (p.bodyHtml.match(/itemprop=["']category["'][^>]*content=["']([^"']+)["']/i) || [])[1] || null;
const counts = {};
for (const p of ps) { const c = cat(p) || '(none)'; counts[c] = (counts[c] || 0) + 1; }
console.log('=== itemprop=category values ===');
Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(String(v).padStart(3), k));
console.log('total reviews', ps.length, '| with category', ps.filter((p) => cat(p)).length);
