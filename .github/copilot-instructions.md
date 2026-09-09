# Copilot instructions for canopy-website

Marketing site and blog for Canopy at canopy.ag. Astro 5 static site with one
serverless API route, deployed by Vercel. `AGENTS.md` at the repo root holds the
rules; `README.md` explains the architecture. Keep both in mind.

## Stack

- Astro 5, `output: 'static'` with the Vercel adapter. Only `src/pages/api/submit-demo.ts`
  sets `prerender = false`.
- MDX blog via `@astrojs/mdx`; content collections defined in `src/content.config.ts`
  with a `glob` loader over `src/content/blog/<slug>/index.mdx`.
- React only for islands. `src/components/DemoForm.tsx` is the one island.
- Tailwind CSS v4 through `@tailwindcss/vite`. No `tailwind.config.js`. Design
  tokens are imported from `@canopy-ag/react-ui/tokens.css` (GitHub Packages, so
  `npm install` needs `NODE_AUTH_TOKEN` with `read:packages`).
- Zod for the demo-form schema (`src/lib/schema.ts`), mirrored in `ingest/server.mjs`.
- Vitest for `src/lib/blog/*.test.ts`.

## Commands

```bash
npm run dev      # astro dev
npm test         # vitest run
npm run build    # astro check && astro build
```

## Structure

```
src/pages/          routes; api/submit-demo.ts is the serverless endpoint
src/layouts/        Layout.astro, PostLayout.astro
src/components/     Hero.astro, DemoForm.tsx, blog/*.astro + blog/mdx.ts
src/content/blog/   one folder per post with colocated media; _template/ is skipped
src/content/authors caleb.json, ermias.json
src/lib/blog/       pure helpers + tests; lib/brand.ts logo switch; lib/schema.ts
src/styles/         global.css (tokens import + utilities), blog.css
ingest/             demo-form ingest shim (Node + Dockerfile), its own image
public/hero, public/logos   media assets
specs/              design docs; see specs/README.md for status
```

## Patterns

- Demo form: browser -> `/api/submit-demo` -> `INGEST_URL` (Tailscale Funnel,
  bearer `INGEST_SECRET`) -> Postgres in the homelab cluster. Email fallback via
  Resend. Never open a Postgres connection from the site.
- Drafts: `draft: true` posts render unless `VERCEL_ENV === 'production'`.
- All post queries go through `src/lib/blog/collection.ts`.
- Custom utilities in `global.css`: `.glass`, `.glow`, `.glow-text`, `.gradient-text`,
  `.btn-primary`, `.btn-secondary`, `.nav-link`.
- Path alias `~/` maps to `src/`.
- API routes export named handlers (`export const POST: APIRoute`) and return
  `Response` objects with JSON bodies.

## Rules

- No em dashes in `src/` (CI fails). No emoji. Sentence case.
- Dark theme only; use `var(--canopy-*)` tokens or the palette in `BRAND_COLORS.md`.
- Alt text on every image; `heroAlt` is required with `heroImage`.
- Deploy by merging to `main` (Vercel). PRs get preview deployments with drafts on.
