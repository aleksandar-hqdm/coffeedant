// WordPress -> Astro migration engine.
// Reads the cleaned dump, extracts published pages/posts + Yoast SEO + redirects,
// converts Gutenberg blocks to clean HTML, and emits Astro content collections.
//
// Usage: node scripts/migrate.mjs [path-to-dump]
import fs from 'node:fs';
import path from 'node:path';
import { loadDump, parseTable } from './lib/wpsql.mjs';

const SRC = process.argv[2] || '_private/wp_coffeedant.sql';
const ORIGIN = 'https://coffeedant.com';
const ROOT = process.cwd();
const PAGES_DIR = path.join(ROOT, 'src/content/pages');
const DATA_DIR = path.join(ROOT, 'src/data');

const BEST_OF = new Set([
  'superautomatic', 'beginners', 'small', 'built-in-grinder',
  'cheap-budget-under-500', 'prosumer-under-1000', 'single-boiler',
]);
const STATIC_PAGES = new Set(['about', 'contact', 'testing', 'tos', 'privacy-policy']);
const SECTION_HUBS = new Set(['espresso-machine', 'coffee-machine', 'grinder']);
// Top-level single-segment slugs that are brand/landing hubs (not reviews).
const BRAND_HUBS = new Set([
  'breville', 'krups', 'gaggia', 'de-longhi', 'lelit', 'rocket-espresso',
  'bosch', 'nespresso', 'keurig',
]);

// Brand detection for the catalog menu. Slugs are consistent (e.g. delonghi-*,
// quick-mill-*), so longest-prefix match on the slug is reliable.
const BRAND_NAMES = {
  'nuova-simonelli': 'Nuova Simonelli', 'quick-mill': 'Quick Mill', 'la-marzocco': 'La Marzocco',
  'la-pavoni': 'La Pavoni', 'dalla-corte': 'Dalla Corte', rocket: 'Rocket Espresso',
  delonghi: "De'Longhi", breville: 'Breville', gaggia: 'Gaggia', krups: 'Krups', lelit: 'Lelit',
  profitec: 'Profitec', bezzera: 'Bezzera', ecm: 'ECM', vbm: 'VBM', crem: 'Crem', jura: 'Jura',
  siemens: 'Siemens', bosch: 'Bosch', melitta: 'Melitta', nivona: 'Nivona', philips: 'Philips',
  saeco: 'Saeco', miele: 'Miele', ascaso: 'Ascaso', cafelat: 'Cafelat', flair: 'Flair',
  londinium: 'Londinium', slayer: 'Slayer', '9barista': '9Barista', rancilio: 'Rancilio',
  rok: 'ROK', timemore: 'Timemore', baratza: 'Baratza', '1zpresso': '1Zpresso',
  nespresso: 'Nespresso',
};
const CANON = { 'de-longhi': 'delonghi', 'rocket-espresso': 'rocket' };
const BRAND_PREFIXES = [...Object.keys(BRAND_NAMES), 'de-longhi', 'rocket-espresso']
  .sort((a, b) => b.length - a.length);
function detectBrand(slug) {
  for (const p of BRAND_PREFIXES) if (slug === p || slug.startsWith(p + '-')) return CANON[p] || p;
  return null;
}
function slugToName(slug, brandKey) {
  let s = slug;
  if (brandKey) for (const p of BRAND_PREFIXES) { if (s === p || s.startsWith(p + '-')) { s = s.slice(p.length).replace(/^-/, ''); break; } }
  return s
    .replace(/-/g, ' ')
    .replace(/\b([a-z]{1,4}\d[\w]*)\b/gi, (m) => m.toUpperCase())
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}
function modelLabel(title, brandKey, slug) {
  let t = String(title).split(/[:|]/)[0].replace(/\breview\b.*/i, '').replace(/^the\s+/i, '').trim();
  const bn = BRAND_NAMES[brandKey];
  if (bn) t = t.replace(new RegExp('^' + bn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "[\\s'’\\-]*", 'i'), '').trim();
  // a clean product name is short; a sentence-style title falls back to the slug
  if (!t || t.split(/\s+/).length > 6 || t.length > 42) t = slugToName(slug, brandKey);
  return t || slugToName(slug, brandKey);
}

const sql = loadDump(SRC);

// ---- parse the tables we need -------------------------------------------------
const posts = parseTable(sql, 'wp_posts').rows;
const yoast = parseTable(sql, 'wp_yoast_indexable').rows;
let redirects = [];
try { redirects = parseTable(sql, 'wp_redirection_items').rows; } catch { /* optional */ }

// Yoast lookup by object_id (post records only)
const yoastById = new Map();
for (const y of yoast) {
  if (y.object_type === 'post' && y.object_id) yoastById.set(String(y.object_id), y);
}

// WordPress stores titles/descriptions with HTML entities; decode them to plain
// text so Astro escapes once on render (avoids "&amp;" showing literally).
function decodeEntities(s) {
  if (s == null) return s;
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&hellip;/g, '…')
    .replace(/&ndash;/g, '–').replace(/&mdash;/g, '—')
    .replace(/&rsquo;|&lsquo;/g, "'").replace(/&rdquo;|&ldquo;/g, '"')
    .replace(/&amp;/g, '&');
}

// Ensure every amazon.com link carries our Associates tag (amzn.to short links
// already encode it; foreign marketplaces are left alone since a US tag is moot).
const AFFILIATE_TAG = 'coffeedant03-20';
function enforceAffiliate(html) {
  // Match every amazon.com URL (href, microdata content, JSON-LD url, plain text)
  // and ensure it carries our tag.
  return html.replace(/https?:\/\/(?:www\.)?amazon\.com\/[^\s"<>]*/gi, (url) => {
    const [base, query = ''] = url.split('?');
    const params = query.split('&').filter((p) => p && !/^tag=/i.test(p));
    params.push('tag=' + AFFILIATE_TAG);
    return base + '?' + params.join('&');
  });
}

// ---- Gutenberg -> HTML --------------------------------------------------------
function blocksToHtml(content) {
  if (!content) return '';
  let html = content
    // drop wp block delimiter comments (opening w/ optional JSON attrs, and closing)
    .replace(/<!--\s*\/?wp:[\s\S]*?-->/g, '')
    // collapse the runs of blank lines the delimiters leave behind
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  // keep images pointing at the live host for now; make other internal links root-relative
  html = html.replace(/https:\/\/coffeedant\.com\/(?!wp-content)/g, '/');
  html = enforceAffiliate(html);
  return html;
}

// Pull product facts out of a review body. Ratings/prices come from the
// authoritative schema.org microdata (no guessing from prose); the buy link is
// the first Amazon link inside the product box.
function extractProduct(html, fallbackImage) {
  let boxStart = html.indexOf('<div class="cd-merged-box"');
  if (boxStart < 0) boxStart = html.search(/schema\.org\/Product/i);
  const box = boxStart > -1 ? html.slice(boxStart, boxStart + 6000) : html;

  const ratingStr =
    (html.match(/itemprop=["']ratingValue["'][^>]*content=["']([\d.]+)["']/i) || [])[1] ||
    (html.match(/content=["']([\d.]+)["'][^>]*itemprop=["']ratingValue["']/i) || [])[1] ||
    (html.match(/itemprop=["']ratingValue["'][^>]*>\s*([\d.]+)/i) || [])[1] || '';
  let rating = ratingStr ? Math.round(parseFloat(ratingStr) * 10) / 10 : null;
  if (rating != null && (rating < 1 || rating > 5)) rating = null;

  const imgTag =
    (html.match(/<img[^>]*itemprop=["']image["'][^>]*>/i) || [])[0] ||
    (box.match(/<img[^>]*src=["'][^"']*(?:wp-content|media-amazon|images-amazon|ssl-images)[^"']*["'][^>]*>/i) || [])[0] || '';
  const image = (imgTag.match(/src=["']([^"']+)["']/) || [])[1] || fallbackImage || null;

  const priceStr = (html.match(/itemprop=["']price["'][^>]*content=["']([\d.]+)["']/i) || [])[1] || '';
  const price = priceStr ? priceStr.replace(/,/g, '') : null;

  const asin = (box.match(/\/dp\/([A-Z0-9]{10})/) || html.match(/\/dp\/([A-Z0-9]{10})/) || [])[1] || null;
  const amazonUrl = (box.match(/href=["'](https?:\/\/(?:amzn\.to|www\.amazon\.[a-z.]+)\/[^"']+)["']/i) ||
    html.match(/href=["'](https?:\/\/(?:amzn\.to|www\.amazon\.[a-z.]+)\/[^"']+)["']/i) || [])[1] || null;

  return { image, rating, asin, amazonUrl, price };
}

function routeFromPermalink(permalink, slug) {
  if (permalink) {
    const p = permalink.replace(ORIGIN, '').replace(/^https?:\/\/[^/]+/, '');
    return p === '' ? '/' : p;
  }
  return slug ? `/${slug}/` : '/';
}

function classify(route, slug) {
  if (route === '/' || slug === 'homepage') return 'homepage';
  const seg = route.replace(/^\/|\/$/g, '').split('/');
  if (seg[0] === 'blog') return 'blog';
  if (STATIC_PAGES.has(slug)) return 'static';
  if (seg.length === 1 && SECTION_HUBS.has(seg[0])) return 'section';
  if (seg.length === 1 && BRAND_HUBS.has(seg[0])) return 'brand';
  if (seg[0] === 'espresso-machine' && seg.length === 2) {
    return BEST_OF.has(seg[1]) ? 'category' : 'review';
  }
  if ((seg[0] === 'grinder' || seg[0] === 'coffee-machine') && seg.length === 2) return 'review';
  return 'page';
}

// ---- build page records -------------------------------------------------------
const SKIP_TYPES = new Set([
  'nav_menu_item', 'wp_navigation', 'oembed_cache', 'forminator_forms',
  'custom_css', 'wpcode', 'attachment', 'revision',
]);

const pages = [];
const report = { byType: {}, missingYoast: [], shortcodes: [], oddBlocks: {}, embeds: [] };

for (const p of posts) {
  if (p.post_status !== 'publish') continue;
  if (SKIP_TYPES.has(p.post_type)) continue;
  if (p.post_type !== 'page' && p.post_type !== 'post') continue;

  const y = yoastById.get(String(p.ID));
  const route = routeFromPermalink(y?.permalink, p.post_name);
  const type = classify(route, p.post_name);
  const bodyHtml = blocksToHtml(p.post_content);
  const product = extractProduct(bodyHtml, y?.open_graph_image || y?.twitter_image || null);

  if (!y) report.missingYoast.push(route);
  const sc = p.post_content.match(/\[[a-z][a-z0-9_-]+[\s\]]/gi);
  if (sc) report.shortcodes.push({ route, codes: [...new Set(sc.map((s) => s.trim()))].slice(0, 6) });
  for (const m of p.post_content.matchAll(/<!--\s*wp:([a-z0-9/-]+)/g)) {
    const b = m[1];
    if (!['html', 'heading', 'paragraph', 'list', 'list-item', 'image', 'separator', 'spacer', 'quote', 'group', 'columns', 'column', 'buttons', 'button'].includes(b)) {
      report.oddBlocks[b] = (report.oddBlocks[b] || 0) + 1;
      if (b.includes('embed') || b === 'core-embed') report.embeds.push(route);
    }
  }

  report.byType[type] = (report.byType[type] || 0) + 1;

  pages.push({
    id: String(p.ID),
    slug: p.post_name,
    route,
    type,
    title: decodeEntities(p.post_title),
    seoTitle: decodeEntities(y?.title) || null,
    description: decodeEntities(y?.description) || null,
    canonical: y?.canonical || (y?.permalink ?? `${ORIGIN}${route}`),
    ogTitle: decodeEntities(y?.open_graph_title || y?.title) || null,
    ogDescription: decodeEntities(y?.open_graph_description || y?.description) || null,
    ogImage: y?.open_graph_image || y?.twitter_image || null,
    breadcrumb: decodeEntities(y?.breadcrumb_title || p.post_title),
    focusKeyword: y?.primary_focus_keyword || null,
    noindex: y?.is_robots_noindex === '1',
    date: p.post_date,
    modified: p.post_modified,
    image: product.image,
    rating: product.rating,
    asin: product.asin,
    amazonUrl: product.amazonUrl,
    price: product.price,
    bodyHtml,
  });
}

// ---- navigation catalog (every review, grouped by brand) ---------------------
const hubByBrand = {};
for (const p of pages.filter((p) => p.type === 'brand')) {
  const bk = detectBrand(p.slug);
  if (bk) hubByBrand[bk] = p.route;
}
const byBrand = new Map();
for (const r of pages.filter((p) => p.type === 'review' && p.route.startsWith('/espresso-machine/'))) {
  const bk = detectBrand(r.slug) || 'other';
  if (!byBrand.has(bk)) byBrand.set(bk, []);
  byBrand.get(bk).push({
    label: modelLabel(r.title, bk, r.slug),
    route: r.route,
    slug: r.slug,
    image: r.image,
    rating: r.rating,
    price: r.price,
    asin: r.asin,
    amazonUrl: r.amazonUrl,
  });
}
const catalog = [...byBrand.entries()]
  .map(([bk, models]) => {
    const rated = models.map((m) => m.rating).filter((n) => typeof n === 'number');
    const avgRating = rated.length ? Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 10) / 10 : null;
    return {
      brand: BRAND_NAMES[bk] || bk.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      slug: bk,
      route: `/brand/${bk}/`,
      hubRoute: hubByBrand[bk] || null,
      count: models.length,
      avgRating,
      models: models.sort((a, b) => a.label.localeCompare(b.label)),
    };
  })
  .sort((a, b) => a.brand.localeCompare(b.brand));

const guideList = pages.filter((p) => p.type === 'category').map((p) => ({ name: p.breadcrumb || p.title, route: p.route }));
const cleanName = (p) => {
  let t = (p.breadcrumb || p.title).split(/[:|?]/)[0].replace(/\breview\b.*/i, '').replace(/^the\s+/i, '').trim();
  if (!t || t.split(/\s+/).length > 6 || t.length > 42) t = slugToName(p.slug, null);
  return t;
};
const grinders = pages
  .filter((p) => p.type === 'review' && p.route.startsWith('/grinder/'))
  .map((p) => ({ label: cleanName(p), route: p.route }))
  .sort((a, b) => a.label.localeCompare(b.label));
const coffeeMachines = [
  ...pages.filter((p) => p.type === 'review' && p.route.startsWith('/coffee-machine/')),
  ...pages.filter((p) => p.slug === 'nespresso' || p.slug === 'keurig'),
]
  .map((p) => ({ label: cleanName(p), route: p.route }))
  .sort((a, b) => a.label.localeCompare(b.label));

const nav = { catalog, guides: guideList, grinders, coffeeMachines };

// ---- redirects ----------------------------------------------------------------
const redirectRules = [];
for (const r of redirects) {
  const from = r.url;
  const to = r.action_data && typeof r.action_data === 'string' ? r.action_data : null;
  if (from && to && to.startsWith('/') && !r.regex) {
    redirectRules.push({ source: from, destination: to, permanent: true });
  }
}

// ---- write outputs ------------------------------------------------------------
fs.rmSync(PAGES_DIR, { recursive: true, force: true });
fs.mkdirSync(PAGES_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
for (const p of pages) fs.writeFileSync(path.join(PAGES_DIR, `${p.id}.json`), JSON.stringify(p));
fs.writeFileSync(path.join(DATA_DIR, 'nav.json'), JSON.stringify(nav, null, 2));

const vercel = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  trailingSlash: true,
  redirects: [
    { source: '/feed', destination: '/', permanent: true },
    { source: '/feed/(.*)', destination: '/', permanent: true },
    { source: '/wp-admin/(.*)', destination: '/', permanent: true },
    { source: '/wp-login.php', destination: '/', permanent: true },
    ...redirectRules,
  ],
};
fs.writeFileSync(path.join(ROOT, 'vercel.json'), JSON.stringify(vercel, null, 2));

// ---- report -------------------------------------------------------------------
console.log('pages emitted:', pages.length);
console.log('by type:', report.byType);
console.log('catalog brands:', catalog.length, '| models:', catalog.reduce((n, b) => n + b.models.length, 0), '| guides:', guideList.length, '| grinders:', grinders.length, '| coffee:', coffeeMachines.length);
const unmatched = byBrand.get('other') || [];
if (unmatched.length) console.log('UNMATCHED brand for:', unmatched.map((m) => m.route));
console.log('redirect rules (from plugin):', redirectRules.length);
console.log('pages missing Yoast meta:', report.missingYoast.length, report.missingYoast.slice(0, 10));
console.log('odd block types:', report.oddBlocks);
console.log('pages with embeds:', [...new Set(report.embeds)].slice(0, 10));
console.log('pages with shortcodes:', report.shortcodes.length, report.shortcodes.slice(0, 8));
console.log('yoast columns available:', parseTable(sql, 'wp_yoast_indexable').columns.join(', '));
