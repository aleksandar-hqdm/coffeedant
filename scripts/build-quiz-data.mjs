// Build src/data/machines.json: every espresso machine with the attributes the
// "Find your machine" quiz needs (type, grinder, milk) plus rating/price/image.
import fs from 'node:fs';

const dir = 'src/content/pages';
const recs = {};
for (const f of fs.readdirSync(dir)) { const p = JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8')); recs[p.slug] = p; }
const nav = JSON.parse(fs.readFileSync('src/data/nav.json', 'utf8'));
const asins = fs.existsSync('src/data/asins.json') ? JSON.parse(fs.readFileSync('src/data/asins.json', 'utf8')) : {};

const category = (h) => (h.match(/itemprop=["']category["'][^>]*content=["']([^"']+)["']/i) || [])[1] || '';

function classify(cat, title, slug) {
  const s = `${cat} ${title} ${slug}`.toLowerCase();
  let type = 'semi-auto';
  if (/lever|europiccola|la-?pavoni|strega|londinium|flair|cafelat|\brok\b|rok-|9barista/.test(s)) type = 'lever';
  else if (/capsule|\bpod\b|nespresso|keurig|k-?cup|single-?serve|vertuo|k-duo/.test(s)) type = 'capsule';
  else if (/stovetop|moka/.test(s)) type = 'manual';
  else if (/super.?automatic|bean.?to.?cup|magnifica|dinamica|eletta|primadonna|jura|lattego|saeco|caferomatica|cadorna|\banima\b|babila|accademia|magenta|brera|passione|melitta.*(cafina|ct8|barista|caffeo)|miele cm|siemens eq|philips \d|nivona|krups.*(evidence|intuition|sensation|arabica|opio|virtuoso)|velasca/.test(s)) type = 'superauto';
  const grinder =
    type === 'superauto' ||
    /integrated grinder|with grinder|bean.?to.?cup|barista express|barista pro|barista touch|impress|oracle|all-in-one|la.?specialista|dynamic duo|grace pl81/.test(s);
  const milk = type === 'superauto' ? 'auto' : type === 'capsule' ? 'none' : 'wand';
  return { type, grinder, milk };
}

const machines = [];
for (const b of nav.catalog) {
  for (const m of b.models) {
    const p = recs[m.slug];
    if (!p) continue;
    machines.push({
      slug: m.slug,
      label: m.label,
      brand: b.brand,
      route: m.route,
      image: p.image,
      rating: p.rating,
      price: p.price,
      asin: p.asin || asins[m.slug] || null,
      amazonUrl: p.amazonUrl,
      ...classify(category(p.bodyHtml), p.title || m.label, m.slug),
    });
  }
}
fs.writeFileSync('src/data/machines.json', JSON.stringify(machines));
const by = {};
for (const m of machines) by[m.type] = (by[m.type] || 0) + 1;
console.log('machines:', machines.length, '| by type:', by, '| with grinder:', machines.filter((m) => m.grinder).length);
