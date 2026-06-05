# Coffeedant

Static site for [coffeedant.com](https://coffeedant.com): independent espresso machine reviews, buying guides, and brewing tips. Migrated from WordPress (WP Engine) to Astro.

## Stack

- **Astro** (static, no SSR): content-focused, near-zero JS by default
- **Content collections**: every page/post is migrated WordPress content stored as JSON in `src/content/pages/`
- **Vercel**: hosting + CDN; pushes to `main` auto-deploy
- **GitHub**: source of truth (`aleksandar-hqdm/coffeedant`)

## Local development

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # outputs to ./dist
npm run preview  # serve the production build locally
```

Requires Node >= 22.12.

## Content migration

The published WordPress content is imported by a local, dependency-free engine. The raw database dump stays out of the repo (it is gitignored under `_private/`).

```sh
# 1. strip the sensitive user tables from the raw dump into _private/
npm run strip-secrets -- C:/path/to/wp_coffeedant.sql

# 2. parse the cleaned dump into Astro content + nav + redirects
npm run migrate
```

`scripts/migrate.mjs` reads `wp_posts` (Gutenberg content), `wp_yoast_indexable` (SEO meta), the taxonomy tables, and `wp_redirection_items`, then writes:

- `src/content/pages/*.json`: one file per page/post (self-contained body HTML + SEO fields)
- `src/data/nav.json`: brand and guide navigation
- `vercel.json`: trailing-slash config and redirects

The generated content is committed, so Vercel builds without needing the dump.

## Project structure

```
├── scripts/
│   ├── lib/wpsql.mjs      # quote-aware MySQL dump parser
│   ├── migrate.mjs        # WordPress to Astro content engine
│   └── strip-secrets.mjs  # removes wp_users/wp_usermeta from the dump
├── src/
│   ├── components/        # Header (mega-menu), Footer
│   ├── content/pages/     # migrated pages (generated)
│   ├── data/nav.json      # navigation (generated)
│   ├── layouts/BaseLayout.astro
│   ├── lib/amazon.ts      # PA-API helper (env-gated)
│   ├── pages/
│   │   ├── index.astro          # homepage
│   │   ├── [...slug].astro       # all migrated pages
│   │   └── blog/index.astro      # blog index
│   └── styles/global.css
├── astro.config.mjs
└── vercel.json            # redirects + trailing slash (generated)
```

## Amazon pricing (Creators API)

Live prices and product images come from the Amazon Creators API (the PA-API 5.0 replacement, retired May 2026). Pipeline:

1. `npm run resolve-asins` follows each `amzn.to` buy link to its ASIN (`src/data/asins.json`).
2. `npm run amazon-refresh` exchanges the OAuth2 client credentials for a token and calls `getItems`, writing live price/image/title to `src/data/amazon.json`.
3. Brand-page cards read `amazon.json` (keyed by ASIN) and show the live price + Amazon image, falling back to the review's own image.

Set `CREATORS_CLIENT_ID`, `CREATORS_CLIENT_SECRET`, `AMAZON_PARTNER_TAG` (see `.env.example`) locally, and as repo secrets so the weekly GitHub Action (`.github/workflows/amazon-weekly.yml`) keeps prices fresh.

## Deploys

Pushes to `main` trigger a Vercel build (`npm run build`, output `dist`). Image assets currently load from the live WordPress host; migrating them into the repo is a follow-up.
