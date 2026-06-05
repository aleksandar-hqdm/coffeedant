// Weekly product refresh via the Amazon Creators API (the PA-API 5.0 replacement,
// retired May 2026). OAuth2 client-credentials -> Bearer token -> POST getItems.
// Reads ASINs (src/data/asins.json + content), writes src/data/amazon.json keyed
// by ASIN with live price, image, title, and affiliate URL.
//
// Env (from .env locally or repo secrets in CI):
//   CREATORS_CLIENT_ID      amzn1.application-oa2-client...
//   CREATORS_CLIENT_SECRET  amzn1.oa2-cs.v1...
//   AMAZON_PARTNER_TAG      coffeedant03-20 (default)
// Without the client id/secret this is a safe no-op.
import fs from 'node:fs';

// minimal .env loader (no dependency)
if (fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const CID = process.env.CREATORS_CLIENT_ID;
const CSEC = process.env.CREATORS_CLIENT_SECRET;
const TAG = process.env.AMAZON_PARTNER_TAG || 'coffeedant03-20';
const MARKET = process.env.AMAZON_MARKETPLACE || 'www.amazon.com';
const TOKEN_URL = process.env.CREATORS_TOKEN_URL || 'https://api.amazon.com/auth/o2/token'; // v3.x NA
const API = 'https://creatorsapi.amazon/catalog/v1/getItems';

if (!CID || !CSEC) {
  console.log('CREATORS_CLIENT_ID / CREATORS_CLIENT_SECRET not set; skipping refresh (no-op).');
  process.exit(0);
}

async function getToken() {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${CID}:${CSEC}`).toString('base64'),
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'creatorsapi::default' }).toString(),
  });
  if (!res.ok) throw new Error(`token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).access_token;
}

async function getItems(token, itemIds) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-marketplace': MARKET },
    body: JSON.stringify({
      itemIds,
      partnerTag: TAG,
      marketplace: MARKET,
      resources: ['offersV2.listings.price', 'itemInfo.title', 'images.primary.large'],
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok && !json.itemsResult) console.error(`getItems ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json?.itemsResult?.items || [];
}

// collect unique ASINs
const bySlug = fs.existsSync('src/data/asins.json') ? JSON.parse(fs.readFileSync('src/data/asins.json', 'utf8')) : {};
const fromContent = fs.readdirSync('src/content/pages')
  .map((f) => JSON.parse(fs.readFileSync('src/content/pages/' + f, 'utf8')).asin)
  .filter(Boolean);
const asins = [...new Set([...Object.values(bySlug), ...fromContent])];
if (!asins.length) { console.log('No ASINs to refresh.'); process.exit(0); }

const out = fs.existsSync('src/data/amazon.json') ? JSON.parse(fs.readFileSync('src/data/amazon.json', 'utf8')) : {};
const updated = new Date().toISOString().slice(0, 10);
const token = await getToken();
let ok = 0;
for (let i = 0; i < asins.length; i += 10) {
  const items = await getItems(token, asins.slice(i, i + 10));
  for (const it of items) {
    const listing = it?.offersV2?.listings?.find((l) => l.isBuyBoxWinner) || it?.offersV2?.listings?.[0];
    const money = listing?.price?.money;
    out[it.asin] = {
      title: it?.itemInfo?.title?.displayValue || null,
      image: it?.images?.primary?.large?.url || null,
      price: money?.amount != null ? String(money.amount) : null,
      displayPrice: money?.displayAmount || null,
      currency: money?.currency || null,
      listPrice: listing?.price?.savingBasis?.money?.displayAmount || null,
      url: it?.detailPageURL || null,
      updated,
    };
    if (money?.amount != null) ok++;
  }
  await new Promise((r) => setTimeout(r, 1100)); // ~1 req/sec
}
const sorted = {};
for (const k of Object.keys(out).sort()) sorted[k] = out[k];
fs.writeFileSync('src/data/amazon.json', JSON.stringify(sorted, null, 1));
console.log(`amazon.json: ${Object.keys(out).length} products (${ok} with a live price), updated ${updated}`);
