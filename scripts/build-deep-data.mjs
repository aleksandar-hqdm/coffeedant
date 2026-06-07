// Extract deep-comparison data from each review's content:
//   - per-feature scores (data-category / data-score on the scoreboard buttons)
//   - key specs (portafilter size, water tank, dimensions, power, boiler type)
//   - feature badges
// Writes src/data/specs.json keyed by slug.
import fs from 'node:fs';

const dir = 'src/content/pages';
const out = {};
const catCounts = {};

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&times;/g, '×').replace(/&deg;/g, '°').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();

// normalize a scoreboard category label to a stable key
function normCat(c) {
  const s = c.toLowerCase();
  if (s.includes('espresso') || s.includes('shot') || s.includes('flavou') || s.includes('flavor')) return 'espresso';
  if (s.includes('milk') || s.includes('steam')) return 'milk';
  if (s.includes('build') || s.includes('quality') || s.includes('material')) return 'build';
  if (s.includes('workflow') || s.includes('use') || s.includes('ease') || s.includes('daily')) return 'ease';
  if (s.includes('feature') || s.includes('tech')) return 'features';
  if (s.includes('value') || s.includes('price')) return 'value';
  if (s.includes('maint') || s.includes('clean')) return 'maintenance';
  return s.replace(/[^a-z]/g, '').slice(0, 14) || 'other';
}

for (const f of fs.readdirSync(dir)) {
  const p = JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8'));
  if (p.type !== 'review' || !p.route.startsWith('/espresso-machine/')) continue;
  const h = p.bodyHtml;

  const scores = {};
  for (const m of h.matchAll(/data-category="([^"]+)"[^>]*data-score="([\d.]+)"/g)) {
    const v = parseFloat(m[2]);
    if (v >= 0 && v <= 10) scores[normCat(m[1])] = v;
  }
  for (const k of Object.keys(scores)) catCounts[k] = (catCounts[k] || 0) + 1;

  // author-written spec chips (reliable): portafilter, boiler, tank, pump, etc.
  const badges = [...h.matchAll(/class="feature-badge">([^<]+)</g)].map((m) => decode(m[1])).slice(0, 6);
  // dimensions: a specific WxDxH triple, unlikely to false-match
  const dm = h.match(/(\d{2,3})\s*(?:&times;|×|x)\s*(\d{2,3})\s*(?:&times;|×|x)\s*(\d{2,3})/i);
  const dims = dm ? `${dm[1]} × ${dm[2]} × ${dm[3]}` : null;

  out[p.slug] = { scores, badges, dims };
}

fs.writeFileSync('src/data/specs.json', JSON.stringify(out));
const withScores = Object.values(out).filter((x) => Object.keys(x.scores).length).length;
console.log('reviews:', Object.keys(out).length, '| with feature scores:', withScores);
console.log('score categories:', catCounts);
const ex = out['rancilio-silvia'];
console.log('rancilio-silvia:', JSON.stringify(ex));
