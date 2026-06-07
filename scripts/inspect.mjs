// Throwaway inspector: understand the dump's shape before building the engine.
import { loadDump, parseTable } from './lib/wpsql.mjs';

const F = process.argv[2] || 'C:/Users/User/Downloads/wp_coffeedant.sql';
const sql = loadDump(F);

const posts = parseTable(sql, 'wp_posts');
console.log('wp_posts columns:', posts.columns.length, '| rows parsed:', posts.rows.length);

const pub = posts.rows.filter((r) => r.post_status === 'publish');
const byType = {};
for (const r of pub) byType[r.post_type] = (byType[r.post_type] || 0) + 1;
console.log('published by post_type:', byType);

function blockHist(content) {
  const hist = {};
  for (const m of content.matchAll(/<!--\s*wp:([a-z0-9/-]+)/g)) hist[m[1]] = (hist[m[1]] || 0) + 1;
  return hist;
}

const r = posts.rows.find((x) => x.post_name === 'rancilio-silvia' && x.post_type !== 'revision');
if (r) {
  console.log('\n=== rancilio-silvia ===');
  console.log('type:', r.post_type, '| title:', r.post_title, '| content length:', r.post_content.length);
  console.log('block histogram:', blockHist(r.post_content));
  console.log('----- first 2200 chars -----\n' + r.post_content.slice(0, 2200));
  console.log('\n----- chars 6000-8200 -----\n' + r.post_content.slice(6000, 8200));
}

console.log('\n=== first 40 published page slugs ===');
console.log(pub.filter((r) => r.post_type === 'page').slice(0, 40).map((r) => r.post_name).join('\n'));
