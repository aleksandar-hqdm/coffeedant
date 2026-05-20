# Coffeedant

Static site for [coffeedant.com](https://coffeedant.com) — honest espresso machine reviews, buying guides, and brewing tips.

## Stack

- **Astro** (static, no SSR) — content-focused, zero-JS by default
- **Cloudflare Pages** — hosting + edge CDN
- **GitHub** — source of truth; pushes to `main` auto-deploy via Cloudflare's GitHub integration

## Local development

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # outputs to ./dist
npm run preview  # serve the production build locally
```

Requires Node ≥ 22.12.

## Project structure

```
├── public/
│   ├── _headers          # Cloudflare edge cache + security headers
│   ├── _redirects        # WordPress → Astro URL migration rules
│   ├── favicon.{ico,svg}
│   └── robots.txt
├── src/
│   ├── layouts/
│   │   └── BaseLayout.astro   # html/head, SEO meta, global styles
│   └── pages/
│       ├── 404.astro
│       └── index.astro
├── astro.config.mjs      # site URL, sitemap, trailing-slash config
└── package.json
```

## Deploys

Pushes to `main` trigger a Cloudflare Pages build:
- Build command: `npm run build`
- Output dir: `dist`
- Node version: 22 (set in Cloudflare Pages env: `NODE_VERSION=22`)

## URL preservation (WP migration)

`public/_redirects` is appended to as we map old WordPress URLs to the new structure.
Format: `<source> <destination> <status_code>`. More specific rules go first.

## Migration status

Migrating from WP Engine. Content backfill in progress.
