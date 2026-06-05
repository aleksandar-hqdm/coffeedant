import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Pages migrated from WordPress. Each JSON file is one page/post; the body is
// self-contained HTML (the original Gutenberg content with block wrappers removed).
const pages = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/pages' }),
  schema: z.object({
    id: z.string(),
    slug: z.string(),
    route: z.string(),
    type: z.string(),
    title: z.string(),
    seoTitle: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    canonical: z.string().nullable().optional(),
    ogTitle: z.string().nullable().optional(),
    ogDescription: z.string().nullable().optional(),
    ogImage: z.string().nullable().optional(),
    breadcrumb: z.string().nullable().optional(),
    focusKeyword: z.string().nullable().optional(),
    noindex: z.boolean().optional(),
    date: z.string().nullable().optional(),
    modified: z.string().nullable().optional(),
    image: z.string().nullable().optional(),
    rating: z.number().nullable().optional(),
    asin: z.string().nullable().optional(),
    amazonUrl: z.string().nullable().optional(),
    price: z.string().nullable().optional(),
    bodyHtml: z.string(),
  }),
});

export const collections = { pages };
