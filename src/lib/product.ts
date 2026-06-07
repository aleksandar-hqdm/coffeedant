// Guards live Amazon data against affiliate links that point at a cheaper
// alternative product (common for high-end machines not sold on Amazon). We only
// trust the live price/image when Amazon's product title actually matches the
// machine's brand or a distinctive model token.

export interface LiveData {
  title?: string | null;
  image?: string | null;
  price?: string | null;
  displayPrice?: string | null;
  url?: string | null;
  updated?: string | null;
}

// Format an ISO date (YYYY-MM-DD) as e.g. "Jun 5, 2026" for "last updated" tags.
export function formatUpdated(date?: string | null): string | null {
  if (!date) return null;
  return new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Match on the brand name, or a distinctive model code (a token containing a
// digit, e.g. BES870XL / PL162T). Plain words like "single", "group", "pro" are
// NOT used: they false-match accessory listings ("...Group Head...").
export function titleMatches(brand: string, label: string, title?: string | null): boolean {
  if (!title) return false;
  const t = norm(title);
  const b = norm(brand);
  if (b.length >= 3 && t.includes(b)) return true;
  const codes = label.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && /\d/.test(w));
  return codes.some((w) => t.includes(norm(w)));
}

// Same-brand accessories (descalers, filters, tampers, pitchers) can pass the
// brand match. These rarely lead a real machine's title, so reject them.
const ACCESSORY = /\b(descal\w+|cleaning\s+(?:tablet|solution|kit|powder)|cartridge|\btamper\b|frothing\s+pitcher|milk\s+pitcher|knock\s*box|portafilter|bottomless|gasket|o[-\s]?ring|\bwdt\b|distribution\s+tool|replacement\s+(?:part|filter|seal))\b/i;
const PRICE_FLOOR = 60; // an "espresso machine" under ~$60 is almost certainly a mismatched accessory

export function liveProduct(
  m: { slug: string; brand: string; label: string; asin?: string | null },
  amz: Record<string, LiveData>,
  asins: Record<string, string>,
): LiveData | null {
  const asin = m.asin || asins[m.slug] || null;
  const live = asin ? amz[asin] : null;
  if (!live) return null;
  if (!titleMatches(m.brand, m.label, live.title)) return null;
  if (live.title && ACCESSORY.test(live.title)) return null;
  const p = live.price ? parseFloat(live.price) : null;
  if (p != null && p < PRICE_FLOOR) return null;
  return live;
}

const TAG = 'coffeedant03-20';
export function searchUrl(brand: string, label: string): string {
  return `https://www.amazon.com/s?k=${encodeURIComponent(`${brand} ${label}`)}&tag=${TAG}`;
}
