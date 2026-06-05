// Amazon Product Advertising API (PA-API 5.0) helper, env-gated.
//
// Phase 1 renders the buy buttons and prices that came across in the migrated
// content. Live pricing/availability is wired here in Phase 2 once the access
// keys are provided via environment variables (never committed to the repo).
//
// Partner Tag is public (it appears in every affiliate link). The Access Key
// and Secret Key are secrets and must come from env only.

export const PARTNER_TAG = import.meta.env.AMAZON_PARTNER_TAG ?? 'coffeedant03-20';

export function isAmazonConfigured(): boolean {
  return Boolean(import.meta.env.AMAZON_ACCESS_KEY && import.meta.env.AMAZON_SECRET_KEY);
}

export interface AmazonOffer {
  asin: string;
  title?: string;
  image?: string;
  price?: string;
  url: string;
}

export function affiliateUrl(asin: string): string {
  return `https://www.amazon.com/dp/${asin}?tag=${PARTNER_TAG}`;
}

// Placeholder for the live PA-API GetItems call. GetItems accepts up to 10 ASINs
// per request; results must not be displayed if older than 24h, so Phase 2 will
// batch + cache and refresh on a schedule (Vercel Cron or a GitHub Action).
export async function getOffers(asins: string[]): Promise<AmazonOffer[]> {
  if (!isAmazonConfigured() || asins.length === 0) return [];
  // TODO(phase 2): sign and call PA-API GetItems, then cache within the 24h window.
  return [];
}
