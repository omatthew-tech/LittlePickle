# LittlePickle website

This directory contains the static Astro marketing site and is configured for
Cloudflare Pages.

## Local verification

```sh
npm ci
npm run build
npm run preview:cloudflare
```

The production output is written to `dist/`. Cloudflare-specific response
headers are authored in `public/_headers` and copied into that directory by
Astro.

## Cloudflare Pages setup

For a Git-connected Pages project, use:

- Production branch: `main`
- Root directory: `website`
- Build command: `npm run build`
- Build output directory: `dist`

Cloudflare reads Node.js `22.12.0` from `.node-version`. The current Pages
project name and output directory are also recorded in `wrangler.jsonc`.

No environment variables are required for the current site. Its canonical
production URL defaults to `https://joinlittlepickle.com`. Set `SITE_URL` only
when intentionally building for another origin.

For a direct upload from an authenticated local shell:

```sh
npm run deploy
```
