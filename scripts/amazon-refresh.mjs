// Weekly Amazon price/metadata refresh via Product Advertising API 5.0 (GetItems).
// Reads ASINs (from src/data/asins.json + content), fetches live price + image +
// availability, writes src/data/amazon.json keyed by ASIN.
//
// Env-gated: with no AMAZON_ACCESS_KEY / AMAZON_SECRET_KEY it logs and exits 0,
// so it is safe to run in CI before keys are configured.
//
// NOTE: PA-API uses AWS Signature V4 with an Access Key + Secret Key from the
// Associates "Product Advertising API" credentials page. Login-with-Amazon
// client IDs (amzn1.application-oa2-client...) do NOT work here.
import fs from 'node:fs';
import crypto from 'node:crypto';

const ACCESS = process.env.AMAZON_ACCESS_KEY;
const SECRET = process.env.AMAZON_SECRET_KEY;
const PARTNER = process.env.AMAZON_PARTNER_TAG || 'coffeedant03-20';
const HOST = process.env.AMAZON_HOST || 'webservices.amazon.com';
const REGION = process.env.AMAZON_REGION || 'us-east-1';
const MARKETPLACE = process.env.AMAZON_MARKETPLACE || 'www.amazon.com';
const SERVICE = 'ProductAdvertisingAPI';
const PATH = '/paapi5/getitems';
const TARGET = 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems';

if (!ACCESS || !SECRET) {
  console.log('AMAZON_ACCESS_KEY / AMAZON_SECRET_KEY not set; skipping refresh (no-op).');
  process.exit(0);
}

// ---- collect ASINs ------------------------------------------------------------
const asinsBySlug = fs.existsSync('src/data/asins.json') ? JSON.parse(fs.readFileSync('src/data/asins.json', 'utf8')) : {};
const fromContent = fs
  .readdirSync('src/content/pages')
  .map((f) => JSON.parse(fs.readFileSync('src/content/pages/' + f, 'utf8')).asin)
  .filter(Boolean);
const asins = [...new Set([...Object.values(asinsBySlug), ...fromContent])];
if (!asins.length) { console.log('No ASINs to refresh.'); process.exit(0); }

// ---- SigV4 helpers ------------------------------------------------------------
const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const hmac = (key, s) => crypto.createHmac('sha256', key).update(s, 'utf8').digest();

function sign(bodyStr) {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const date = amzDate.slice(0, 8);
  const headers = {
    'content-encoding': 'amz-1.0',
    'content-type': 'application/json; charset=utf-8',
    host: HOST,
    'x-amz-date': amzDate,
    'x-amz-target': TARGET,
  };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map((k) => `${k}:${headers[k]}\n`).join('');
  const canonicalRequest = ['POST', PATH, '', canonicalHeaders, signedHeaders, sha256(bodyStr)].join('\n');
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  const kDate = hmac('AWS4' + SECRET, date);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${ACCESS}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { ...headers, Authorization: authorization };
}

async function getItems(batch) {
  const body = JSON.stringify({
    ItemIds: batch,
    ItemIdType: 'ASIN',
    PartnerTag: PARTNER,
    PartnerType: 'Associates',
    Marketplace: MARKETPLACE,
    Resources: ['Images.Primary.Large', 'ItemInfo.Title', 'Offers.Listings.Price', 'Offers.Listings.Availability.Message'],
  });
  const res = await fetch(`https://${HOST}${PATH}`, { method: 'POST', headers: sign(body), body });
  if (!res.ok) { console.error(`batch failed ${res.status}: ${(await res.text()).slice(0, 300)}`); return []; }
  const json = await res.json();
  return json?.ItemsResult?.Items || [];
}

// ---- run ----------------------------------------------------------------------
const out = fs.existsSync('src/data/amazon.json') ? JSON.parse(fs.readFileSync('src/data/amazon.json', 'utf8')) : {};
const updated = new Date().toISOString().slice(0, 10);
for (let i = 0; i < asins.length; i += 10) {
  const batch = asins.slice(i, i + 10);
  const items = await getItems(batch);
  for (const it of items) {
    const listing = it?.Offers?.Listings?.[0];
    out[it.ASIN] = {
      title: it?.ItemInfo?.Title?.DisplayValue || null,
      image: it?.Images?.Primary?.Large?.URL || null,
      price: listing?.Price?.Amount ? String(listing.Price.Amount) : null,
      currency: listing?.Price?.Currency || null,
      availability: listing?.Availability?.Message || null,
      url: it?.DetailPageURL || null,
      updated,
    };
  }
  console.log(`batch ${i / 10 + 1}: ${items.length} items`);
  await new Promise((r) => setTimeout(r, 1100)); // ~1 req/sec
}
fs.writeFileSync('src/data/amazon.json', JSON.stringify(out, null, 1));
console.log(`amazon.json updated: ${Object.keys(out).length} products`);
