# Copilot Instructions for Canopy Website

## Purpose

Marketing website for Canopy (`canopy.ag`). Astro 5 static site with serverless API routes, deployed on Vercel.

## Tech Stack

- **Astro 5** with `output: 'static'` + Vercel adapter (enables serverless API routes)
- **React** for interactive islands only (DemoForm modal via `client:load`)
- **Tailwind CSS v4** via `@tailwindcss/vite` plugin (NOT PostCSS — no `tailwind.config.js`)
- **postgres.js** for direct SQL (not an ORM) to CNPG PostgreSQL via Tailscale Funnel
- **Zod** for validation schemas
- **Resend** for transactional email

## Commands

```bash
npm run dev      # astro dev
npm run build    # astro check && astro build (type-checks first)
npm run preview  # astro preview
```

## Structure

```
src/
  pages/         # File-based routing (.astro), API routes in api/
  layouts/       # Single Layout.astro (glassmorphism nav, footer)
  components/    # React .tsx (interactive islands only)
  lib/           # db.ts, schema.ts
  styles/        # global.css (@theme vars, custom utilities)
  content/posts/ # Markdown blog posts (Astro Content Collections + Zod schema)
public/          # Static assets (SVG logos, favicon)
specs/           # Feature specifications
```

## Key Patterns

- **Dark theme only**: Deep navy backgrounds (#0B1120), green (#22C55E) primary, blue (#00D4FF) accents
- **Custom CSS utilities**: `.glass`, `.glow`, `.glow-text`, `.gradient-text`, `.btn-primary` defined in `global.css`
- **Tailwind v4 theming**: Uses `@theme` directive with CSS custom properties — no JS config file
- **Path alias**: `~/` maps to `src/` (configured in tsconfig)
- **API routes**: Export named HTTP handlers (`export const POST: APIRoute`), return `new Response(JSON.stringify(...))`
- **Resilient form submission**: DB insert → email fallback via Resend → always returns success to user
- **Blog posts**: Content Collections with Zod schema (`title`, `description`, `pubDate`, `draft`, `tags`, `heroImage`)
- **Database**: `POSTGRES_URL` env var, connection via Tailscale Funnel to home K8s cluster CNPG

## Conventions

- Pages are `.astro`, interactive components are `.tsx` (React islands)
- No testing setup currently
- Content in `src/content/posts/` as Markdown with frontmatter
- Deploy by pushing to `main` (Vercel auto-deploy)
