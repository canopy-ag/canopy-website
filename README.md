# Canopy website

Source for [canopy.ag](https://canopy.ag), the Canopy marketing site and blog.
Astro 5 static site with one serverless API route (the demo form), deployed by
Vercel. Public repo: [canopy-ag/canopy-website](https://github.com/canopy-ag/canopy-website).

- Writing a blog post: see [CONTRIBUTING.md](CONTRIBUTING.md).
- Changing code: read on.
- Working as an agent (Claude Code, Codex, Copilot): see [AGENTS.md](AGENTS.md).

## Contents

1. [What is here](#what-is-here)
2. [Tech stack](#tech-stack)
3. [Local development](#local-development)
4. [Repo layout](#repo-layout)
5. [How the site works](#how-the-site-works)
6. [Environment variables](#environment-variables)
7. [CI](#ci)
8. [Deployment](#deployment)
9. [Contributing code](#contributing-code)
10. [Troubleshooting](#troubleshooting)

## What is here

| Surface | Route | Source |
|---|---|---|
| Home (video hero, product sections, demo CTA) | `/` | `src/pages/index.astro`, `src/components/Hero.astro` |
| About | `/about` | `src/pages/about.astro` |
| Blog index with tag filter | `/blog` | `src/pages/blog/index.astro` |
| Post | `/blog/<slug>` | `src/pages/blog/[slug].astro`, `src/layouts/PostLayout.astro` |
| Tag page | `/blog/tag/<tag>` | `src/pages/blog/tag/[tag].astro` |
| RSS feed | `/rss.xml` | `src/pages/rss.xml.ts` |
| Demo-form submit (serverless) | `POST /api/submit-demo` | `src/pages/api/submit-demo.ts` |

The demo form's lead database lives in the homelab Kubernetes cluster. The tiny
service that receives submissions there (the "ingest shim") is also in this repo,
under [`ingest/`](ingest/README.md), and ships as its own container image.

## Tech stack

| Piece | What it does here |
|---|---|
| [Astro 5](https://astro.build) | Static site generator. `output: 'static'` plus the Vercel adapter so a single route can opt into on-demand rendering. |
| `@astrojs/mdx` | Blog posts are MDX with a handful of custom components. |
| `@astrojs/react` | One React island: the demo-form modal (`src/components/DemoForm.tsx`). Everything else is `.astro`. |
| Tailwind CSS v4 | Via the `@tailwindcss/vite` plugin. No `tailwind.config.js`; theme comes from CSS. |
| `@tailwindcss/typography` | Prose styling for post bodies. |
| `@canopy-ag/react-ui/tokens.css` | Canopy design tokens (`--canopy-green`, `--canopy-dark`, and so on) shared with the product app. Imported once in `src/styles/global.css`. Published to GitHub Packages, which is why install needs a token. |
| `@astrojs/rss`, `@astro-community/astro-embed-youtube`, `reading-time` | Feed, click-to-load YouTube embeds, and the reading-time remark plugin. |
| Zod | Validates demo-form submissions (site and shim share the same shape). |
| Resend | Email fallback when the ingest shim cannot be reached. |
| Vitest | Unit tests for the pure blog helpers in `src/lib/blog/`. |
| Vercel | Hosting, preview deployments per PR, production on `main`. |

Node: CI runs Node 22 and the Vercel project is on Node 24. Use 22 or newer locally.

## Local development

### 1. Get a GitHub Packages token

`@canopy-ag/react-ui` is published to the `canopy-ag` org's GitHub Packages npm
registry, and the committed `.npmrc` reads `NODE_AUTH_TOKEN` at install time.
You need a token with the `read:packages` scope. Either:

- Create a classic personal access token (GitHub Settings, Developer settings,
  Personal access tokens, Tokens (classic)) with `read:packages`, or
- add the scope to the GitHub CLI login and reuse it:

  ```bash
  gh auth refresh -h github.com -s read:packages
  export NODE_AUTH_TOKEN="$(gh auth token)"
  ```

The default `gh` login does not carry `read:packages`, so `gh auth token` alone
fails with a 403 until you run the refresh above.

### 2. Install and run

```bash
export NODE_AUTH_TOKEN=<token with read:packages>
npm install
npm run dev          # http://localhost:4321
```

### 3. Scripts

| Command | What it runs |
|---|---|
| `npm run dev` | `astro dev`. Drafts are visible. |
| `npm run build` | `astro check && astro build`. Type-checks `.astro` and `.ts`, validates content frontmatter and image paths, then builds to `dist/`. |
| `npm run preview` | Serves `dist/` locally. |
| `npm test` | `vitest run` over `src/**/*.test.ts`. |
| `npm run astro -- <cmd>` | Any other Astro CLI command. |

Optional local env: copy `.env.example` to `.env.local`. Without `INGEST_URL` and
`INGEST_SECRET` the demo form falls back to email (or to a console warning if
`RESEND_API_KEY` is also unset). The site itself needs no env vars to run.

## Repo layout

```
.
├── src/
│   ├── pages/              File-based routes. api/submit-demo.ts is the only serverless route.
│   ├── layouts/            Layout.astro (nav, footer, meta), PostLayout.astro (blog post chrome)
│   ├── components/         Hero.astro, DemoForm.tsx (React island), blog/* (MDX + listing components)
│   ├── content/
│   │   ├── blog/<slug>/    One folder per post: index.mdx plus its images and clips
│   │   ├── blog/_template/ Starter post. Underscore folders are excluded from the build.
│   │   └── authors/        caleb.json, ermias.json
│   ├── content.config.ts   Collection loaders and Zod schemas for blog + authors
│   ├── lib/
│   │   ├── blog/           Pure helpers (sort, drafts, prev/next, related, tags, reading time) + tests
│   │   ├── brand.ts        Logo variant switch (PUBLIC_LOGO_VARIANT)
│   │   └── schema.ts       Demo-form Zod schema
│   └── styles/             global.css (tokens import, utilities), blog.css
├── public/
│   ├── hero/               Committed hero loop video + poster (see public/hero/README.md)
│   └── logos/{hex,leafy}/  Two logo sets; brand.ts picks one
├── ingest/                 Demo-form ingest shim: single-file Node service + Dockerfile
├── scripts/                migrate-squarespace.mjs, the one-off importer used for the six original posts
├── specs/                  Design docs. See specs/README.md for what is current vs historical.
├── assets/README.md        Logo asset notes
├── BRAND_COLORS.md         Palette reference
├── .stitch/DESIGN.md       Natural-language design brief for generating on-brand pages
├── .plan/                  Archived plan/decision log from the design-token cutover (eflow artifact)
├── .github/workflows/      site-ci.yml, ingest-image.yml
├── astro.config.mjs        MDX + React integrations, Vercel adapter, reading-time plugin
├── vitest.config.ts        Test glob
├── vercel.json             Framework, build and output settings for Vercel
└── .npmrc                  Routes @canopy-ag/* to GitHub Packages using NODE_AUTH_TOKEN
```

## How the site works

### Blog content model

- Posts are `src/content/blog/<slug>/index.mdx`. The folder name is the URL slug.
  The loader in `src/content.config.ts` matches `*/index.mdx` and skips `_*`.
- Frontmatter is validated by Zod: `title`, `description`, `pubDate`, optional
  `updatedDate`, `author` (reference into the `authors` collection, default `caleb`),
  `tags` (kebab-case), `heroImage` (a file next to the post), `heroAlt` (required
  when `heroImage` is set), `heroCaption`, `draft`.
- `src/lib/blog/collection.ts` is the single place that filters and sorts posts.
  Every page and the RSS feed go through it.
- **Drafts**: `draft: true` posts render everywhere except Vercel production builds.
  The switch is `VERCEL_ENV !== 'production'` (`src/lib/blog/posts.ts`), which is
  why Site CI builds with `VERCEL_ENV=production`, and why PR previews show drafts.
- MDX components (`Figure`, `Video`, `Clip`, `Callout`, `PullQuote`) are injected
  through `src/components/blog/mdx.ts`, so posts use them without importing.
- Reading time is computed by a remark plugin registered in `astro.config.mjs`
  and read from `remarkPluginFrontmatter.minutesRead`.
- Tags: labels for known tags live in `src/lib/blog/tags.ts`. Unknown tags fall
  back to sentence case, so adding a tag never breaks the build.

### Styling

- `src/styles/global.css` imports Tailwind, the react-ui token sheet, and the
  typography plugin, then defines the site's utilities (`.glass`, `.glow`,
  `.gradient-text`, `.btn-primary`, `.btn-secondary`, `.nav-link`).
- Tokens are CSS variables named `--canopy-*` (for example `--canopy-green`,
  `--canopy-blue`, `--canopy-dark`, `--canopy-card`). Prefer `var(--canopy-*)`
  over new raw hex. `BRAND_COLORS.md` lists the palette and where each color is used.
- Dark theme only. Inter is loaded from Google Fonts in `Layout.astro`.

### Branding switches

- `PUBLIC_LOGO_VARIANT=hex|leafy` selects which set under `public/logos/` the
  layout uses (`src/lib/brand.ts`). Default `hex`.
- The home hero streams `public/hero/canopy-hero-loop.mp4` with a poster
  fallback. Reduced-motion and Save-Data visitors get the poster only. Regen notes
  and source links are in `public/hero/README.md`.

### Demo form and the ingest shim

The homelab Postgres is not reachable from Vercel: Tailscale Funnel only forwards
HTTPS-style ports, and Vercel functions are not tailnet members. So the write path
has one extra hop:

```
browser
  -> POST /api/submit-demo          Vercel function (prerender = false), validates with Zod
    -> POST $INGEST_URL             ingest shim over Tailscale Funnel :443, Bearer $INGEST_SECRET, 8 s timeout
      -> INSERT demo_submissions    Postgres StatefulSet canopy-website-db (namespace canopy-website)
```

- The function forwards the visitor's IP, user agent, and referrer as headers so
  the shim's audit columns are real, not the Vercel egress IP.
- If the shim is unreachable, times out, or returns non-2xx, the function emails
  the lead to `hello@canopy.ag` through Resend and still returns success to the
  visitor. If `RESEND_API_KEY` is also missing the lead is only logged. Check
  Vercel function logs if submissions seem to vanish.
- Shim source, endpoints, and env: [`ingest/README.md`](ingest/README.md).
- Cluster side (Deployment, Funnel Ingress, Vault-backed secrets, the Postgres
  StatefulSet and its init Job): `canopy-k8s-configs/canopy-tools/canopy-website-ingest/`
  and `canopy-k8s-configs/canopy-tools/postgres-canopy-website/`, both registered
  with ArgoCD under `apps/`.

Table `demo_submissions` (from the k8s init Job): `id` UUID PK, `company_name`,
`contact_name`, `email`, `phone`, `company_size`, `message`, `ip_address` INET,
`user_agent`, `referrer`, `submitted_at` timestamptz, `status` (default `new`).

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `NODE_AUTH_TOKEN` | local shell, CI secret, Vercel project | GitHub Packages token with `read:packages` for `@canopy-ag/react-ui`. Install-time only. |
| `INGEST_URL` | Vercel, `.env.local` | Full URL of the shim's POST endpoint, `https://canopy-website-ingest.<tailnet>.ts.net/demo`. |
| `INGEST_SECRET` | Vercel, `.env.local` | Shared bearer secret. Must equal the `ingest-secret` key of the `canopy-website-ingest-secret` Kubernetes secret (sourced from Vault). |
| `RESEND_API_KEY` | Vercel, `.env.local` | Optional. Enables the email fallback. |
| `PUBLIC_LOGO_VARIANT` | anywhere | `hex` (default) or `leafy`. Public, baked into the build. |
| `VERCEL_ENV` | set by Vercel; CI sets `production` | `production` hides drafts. Anything else shows them. |

`.env.example` documents the local set. `.env`, `.env.local`, and `.env.production`
are gitignored.

## CI

Two workflows in `.github/workflows/`:

**Site CI** (`site-ci.yml`) runs on every pull request and on pushes to `main`,
on `ubuntu-latest` with Node 22:

1. `npm ci`, authenticating to GitHub Packages with the `GH_PACKAGES_READ_TOKEN`
   repo secret, falling back to the workflow `GITHUB_TOKEN`.
2. Em-dash gate: fails if any `.astro`, `.mdx`, `.md`, `.ts`, `.tsx`, or `.json`
   file under `src/` contains U+2014. Use a comma, colon, or period instead.
3. `npm test`.
4. `npm run build` with `VERCEL_ENV=production`, so a draft-only mistake or a
   schema error surfaces the same way it would in the real production build.

**Build ingest image** (`ingest-image.yml`) runs on pushes to `main` that touch
`ingest/**` (or on manual dispatch), on the self-hosted `canopy-arc-runners-dind`
runner. It publishes `ghcr.io/canopy-ag/canopy-website-ingest` with an immutable
`main-<shortsha>-<timestamp>` tag plus `latest`, and prints the tag in the run
summary.

## Deployment

**Site.** Vercel's GitHub integration deploys the repo. Every PR gets a preview
deployment (the Vercel bot comments the URL, and drafts are visible there).
Merging to `main` deploys production at canopy.ag. `vercel.json` pins the
framework, build command, and output directory. The project must carry
`NODE_AUTH_TOKEN`, `INGEST_URL`, `INGEST_SECRET`, and (optionally)
`RESEND_API_KEY` in its environment variables.

**Ingest shim.** Merging a change under `ingest/` publishes a new image (see CI).
Deploying it is a separate pull request in `canopy-k8s-configs`: pin the new
immutable tag in `canopy-tools/canopy-website-ingest/deployment.yaml` and let
ArgoCD sync. Rotating `INGEST_SECRET` is a Vault change plus a Vercel env update;
the recipe is in that directory's README.

## Contributing code

1. Branch from `main`. `main` is not branch-protected today, so treat a green
   Site CI check and a look at the Vercel preview as the merge bar.
2. Keep PR titles in the conventional-commit shape the history uses
   (`feat(blog): ...`, `fix: ...`, `docs: ...`, `ci: ...`, `chore: ...`). Merges
   are squash-style with the PR number appended.
3. Before pushing, run `npm test` and `npm run build`. The build is the real gate:
   it type-checks and validates every post's frontmatter and image paths.
4. Open the PR, wait for Site CI and the Vercel preview, click through the
   preview on desktop and phone widths.
5. Content and copy rules apply to code too: sentence-case headings, no em dashes
   in `src/` (CI enforced), no emoji, alt text on every image, brand colors only.
   The full list is in [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).

Where things go:

- New page: `src/pages/<name>.astro` using `Layout.astro`.
- New interactive widget: a `.tsx` island in `src/components/`, mounted with a
  `client:*` directive. Keep React to islands; the rest of the site is `.astro`
  with only small inline scripts (YouTube facade, clip reduced-motion check, tag filter).
- New MDX component for posts: add it under `src/components/blog/` and register
  it in `src/components/blog/mdx.ts`.
- New blog helper: keep it pure in `src/lib/blog/` and add a Vitest case next to it.
- Anything that talks to the lead database: change the shim in `ingest/`, keep
  `ingest/server.mjs`'s Zod schema in step with `src/lib/schema.ts`, and remember
  the image needs a k8s-configs pin to go live.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `npm install` fails with `403 ... does not match expected scopes` | The token exists but lacks `read:packages`. Run `gh auth refresh -h github.com -s read:packages` or create a classic PAT with that scope. |
| `npm install` fails with `401 Unauthorized ... cannot be authenticated` | The token is expired or revoked. Mint a new one and re-export `NODE_AUTH_TOKEN`. |
| Site CI fails on the em-dash step | Search `src/` for U+2014 and rewrite. `rg -n '\x{2014}' src` finds them. |
| Build fails with a content schema error | Usually a missing `heroAlt` next to a `heroImage`, a tag that is not kebab-case, or an image path that does not resolve. The error names the post. |
| A draft shows up on canopy.ag | Only possible if `VERCEL_ENV` is not `production` on the production build. Check the Vercel project settings. |
| Demo submissions never reach the database | Check the Vercel function logs for `Ingest returned` or `Ingest request failed`, then `curl` the shim's `/healthz`. Leads land in `hello@canopy.ag` inbox in the meantime if Resend is configured. |
| Vercel build fails on install | The project's `NODE_AUTH_TOKEN` env var expired. Replace it in the Vercel project settings. |
