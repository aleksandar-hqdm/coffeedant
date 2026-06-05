// Step zero: produce a cleaned copy of the WordPress dump with the sensitive
// user tables removed, stored in a gitignored _private/ folder inside the repo.
// Usage: node scripts/strip-secrets.mjs <path-to-original-dump>
import fs from 'node:fs';
import path from 'node:path';
import { loadDump, stripTables } from './lib/wpsql.mjs';

const src = process.argv[2] || 'C:/Users/User/Downloads/wp_coffeedant.sql';
const outDir = path.resolve('_private');
const out = path.join(outDir, 'wp_coffeedant.sql');

const sql = loadDump(src);
const before = (sql.match(/`wp_users(meta)?`/g) || []).length;
const cleaned = stripTables(sql, ['wp_users', 'wp_usermeta']);
const after = (cleaned.match(/`wp_users(meta)?`/g) || []).length;

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(out, cleaned, 'utf8');

console.log(`source: ${src}`);
console.log(`user-table references before: ${before}, after: ${after}`);
console.log(`cleaned dump written to: ${out} (${(cleaned.length / 1024 / 1024).toFixed(1)} MB)`);
if (after !== 0) {
  console.error('WARNING: user-table references remain; do not commit this file.');
  process.exit(1);
}
