// Enriched machine catalog reused by the explorer, compare tool, and search.
// Merges the live Amazon price/image (validated against wrong-product links).
import machinesRaw from '../data/machines.json';
import amazon from '../data/amazon.json';
import asinMap from '../data/asins.json';
import { liveProduct, searchUrl, type LiveData } from './product';

export interface CatalogMachine {
  slug: string;
  label: string;
  brand: string;
  route: string;
  type: string;
  grinder: boolean;
  milk: string;
  rating: number | null;
  image: string | null;
  price: number | null;
  displayPrice: string | null;
  buyUrl: string;
}

const amz = amazon as Record<string, LiveData>;
const asins = asinMap as Record<string, string>;

export const machines: CatalogMachine[] = (machinesRaw as any[]).map((m) => {
  const live = liveProduct(m, amz, asins);
  const price = live?.price ? parseFloat(live.price) : m.price ? parseFloat(m.price) : null;
  return {
    slug: m.slug,
    label: m.label,
    brand: m.brand,
    route: m.route,
    type: m.type,
    grinder: !!m.grinder,
    milk: m.milk,
    rating: m.rating ?? null,
    image: live?.image || m.image || null,
    price: price != null && !Number.isNaN(price) ? price : null,
    displayPrice: live?.displayPrice || null,
    buyUrl: live?.url || searchUrl(m.brand, m.label),
  };
});

export const TYPE_LABEL: Record<string, string> = {
  superauto: 'Super-automatic',
  'semi-auto': 'Semi-automatic',
  lever: 'Lever / manual',
  manual: 'Lever / manual',
  capsule: 'Capsule',
};
export const MILK_LABEL: Record<string, string> = {
  auto: 'Auto frother',
  wand: 'Steam wand',
  none: 'No milk system',
};

// Slim index for site-wide search (ships on every page, so keep it tiny).
export const searchIndex = machines.map((m) => ({ l: m.label, b: m.brand, r: m.route, t: m.type }));
