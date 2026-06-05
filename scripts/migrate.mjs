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
  return html;
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
    title: p.post_title,
    seoTitle: y?.title || null,
    description: y?.description || null,
    canonical: y?.canonical || (y?.permalink ?? `${ORIGIN}${route}`),
    ogTitle: y?.open_graph_title || y?.title || null,
    ogDescription: y?.open_graph_description || y?.description || null,
    ogImage: y?.open_graph_image || y?.twitter_image || null,
    breadcrumb: y?.breadcrumb_title || p.post_title,
    focusKeyword: y?.primary_focus_keyword || null,
    noindex: y?.is_robots_noindex === '1',
    date: p.post_date,
    modified: p.post_modified,
    bodyHtml,
  });
}

// ---- navigation data (brands + guides) ---------------------------------------
const brandList = pages
  .filter((p) => p.type === 'brand')
  .map((p) => ({ name: p.title.replace(/\s*[-|].*$/, '').trim(), slug: p.slug, route: p.route }))
  .sort((a, b) => a.name.localeCompare(b.name));
const guideList = pages
  .filter((p) => p.type === 'category')
  .map((p) => ({ name: p.breadcrumb || p.title, route: p.route }));
const nav = {
  brands: brandList,
  guides: guideList,
  sections: pages.filter((p) => p.type === 'section').map((p) => ({ name: p.breadcrumb || p.title, route: p.route })),
};

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
console.log('brands:', brandList.length, '| guides:', guideList.length);
console.log('redirect rules (from plugin):', redirectRules.length);
console.log('pages missing Yoast meta:', report.missingYoast.length, report.missingYoast.slice(0, 10));
console.log('odd block types:', report.oddBlocks);
console.log('pages with embeds:', [...new Set(report.embeds)].slice(0, 10));
console.log('pages with shortcodes:', report.shortcodes.length, report.shortcodes.slice(0, 8));
console.log('yoast columns available:', parseTable(sql, 'wp_yoast_indexable').columns.join(', '));
