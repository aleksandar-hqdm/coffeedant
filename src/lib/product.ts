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

export function liveProduct(
  m: { slug: string; brand: string; label: string; asin?: string | null },
  amz: Record<string, LiveData>,
  asins: Record<string, string>,
): LiveData | null {
  const asin = m.asin || asins[m.slug] || null;
  const live = asin ? amz[asin] : null;
  if (!live) return null;
  return titleMatches(m.brand, m.label, live.title) ? live : null;
}

const TAG = 'coffeedant03-20';
export function searchUrl(brand: string, label: string): string {
  return `https://www.amazon.com/s?k=${encodeURIComponent(`${brand} ${label}`)}&tag=${TAG}`;
}
