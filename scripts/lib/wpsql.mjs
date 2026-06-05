// Minimal, dependency-free parser for a phpMyAdmin MySQL dump.
// Quote-and-escape aware: handles \' \" \\ \n \r \t inside string literals
// and semicolons/commas/parens embedded in content.
import fs from 'node:fs';

export function loadDump(path) {
  return fs.readFileSync(path, 'utf8');
}

export function unescapeSql(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) {
      const n = s[i + 1];
      const map = { '0': '\0', n: '\n', r: '\r', t: '\t', b: '\b', Z: '\x1a', '\\': '\\', "'": "'", '"': '"' };
      out += n in map ? map[n] : n;
      i++;
    } else {
      out += c;
    }
  }
  return out;
}

// Read VALUES tuples starting at the first "(" after VALUES, until the ";".
function parseTuples(s, start) {
  const rows = [];
  let i = start;
  const n = s.length;
  while (i < n) {
    while (i < n && (s[i] === ' ' || s[i] === '\n' || s[i] === '\r' || s[i] === '\t' || s[i] === ',')) i++;
    if (i < n && s[i] === ';') { i++; break; }
    if (i >= n || s[i] !== '(') break;
    i++; // skip "("
    const fields = [];
    let cur = '';
    let inStr = false;
    while (i < n) {
      const c = s[i];
      if (inStr) {
        if (c === '\\') { cur += c + (s[i + 1] ?? ''); i += 2; continue; }
        if (c === "'") { inStr = false; cur += c; i++; continue; }
        cur += c; i++; continue;
      } else {
        if (c === "'") { inStr = true; cur += c; i++; continue; }
        if (c === ',') { fields.push(cur); cur = ''; i++; continue; }
        if (c === ')') { fields.push(cur); i++; break; }
        cur += c; i++; continue;
      }
    }
    rows.push(fields);
  }
  return { rows, end: i };
}

function decode(field) {
  const t = field.trim();
  if (t === 'NULL') return null;
  if (t.length >= 2 && t[0] === "'" && t[t.length - 1] === "'") return unescapeSql(t.slice(1, -1));
  return t;
}

// Parse all rows of a table across one or more INSERT statements.
export function parseTable(sql, table) {
  const rows = [];
  let colNames = null;
  const insertRe = new RegExp('INSERT INTO `' + table + '` \\(([^)]*)\\) VALUES', 'g');
  let m;
  while ((m = insertRe.exec(sql)) !== null) {
    if (!colNames) colNames = m[1].split(',').map((c) => c.trim().replace(/`/g, ''));
    const valuesStart = sql.indexOf('(', m.index + m[0].length);
    const { rows: tuples, end } = parseTuples(sql, valuesStart);
    for (const fields of tuples) {
      if (fields.length !== colNames.length) continue;
      const obj = {};
      colNames.forEach((cn, k) => { obj[cn] = decode(fields[k]); });
      rows.push(obj);
    }
    insertRe.lastIndex = end;
  }
  return { columns: colNames || [], rows };
}

// Quote-aware split into SQL statements (keeps the trailing ";").
export function splitStatements(sql) {
  const stmts = [];
  let cur = '';
  let inStr = false;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (inStr) {
      if (c === '\\') { cur += c + (sql[i + 1] ?? ''); i++; continue; }
      if (c === "'") { inStr = false; cur += c; continue; }
      cur += c; continue;
    } else {
      if (c === "'") { inStr = true; cur += c; continue; }
      if (c === ';') { cur += c; stmts.push(cur); cur = ''; continue; }
      cur += c;
    }
  }
  if (cur.trim()) stmts.push(cur);
  return stmts;
}

// Remove every statement that references any of the given backticked tables.
export function stripTables(sql, tableNames) {
  const needles = tableNames.map((t) => '`' + t + '`');
  return splitStatements(sql)
    .filter((stmt) => !needles.some((nd) => stmt.includes(nd)))
    .join('');
}
