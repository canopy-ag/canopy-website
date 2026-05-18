# Canopy Website

A modern Astro website for Canopy — growing the future of agriculture.

## Tech Stack

- **Astro 5** — Static site generator
- **Astro Content Collections** — Type-safe Markdown/MDX content
- **Tailwind CSS v4** — Styling with electric blue (#00D4FF) theme
- **React** — Interactive components
- **Vercel** — Deployment

## Getting Started

> **Heads up — install requires GitHub Packages auth.** This repo depends on
> `@canopy-ag/react-ui` (design tokens), which is published to the
> `canopy-ag` org's GitHub Packages npm registry. Export a classic PAT with
> `read:packages` scope on `canopy-ag` before installing:
>
> ```bash
> export NODE_AUTH_TOKEN=<your classic PAT>
> ```
>
> The committed `.npmrc` reads the token at `npm install` time; nothing is
> persisted. Vercel builds use the project-level `NODE_AUTH_TOKEN` env var.

```bash
# Install dependencies (requires NODE_AUTH_TOKEN — see above)
npm install

# Run dev server
npm run dev

# Build for production
npm run build
```

## Adding Blog Posts

Create a new `.md` or `.mdx` file in `src/content/posts/`:

```yaml
---
title: "Your Post Title"
description: "Brief description"
pubDate: 2026-02-09
draft: false
tags: ["tag1", "tag2"]
heroImage: "/images/your-image.jpg"  # optional
---

Your content here...
```

## Deployment

Push to the `main` branch and Vercel will automatically deploy.

## Database Integration

The demo form persists submissions to a CNPG PostgreSQL cluster via Tailscale Funnel.

### Architecture

```
Vercel Edge → Tailscale Funnel → Home K8s Cluster → postgres-dev (CNPG)
```

### Database Schema

**Table:** `demo_submissions`
- `id` (UUID, PK) - Auto-generated
- `company_name` (VARCHAR) - Required
- `contact_name` (VARCHAR) - Required  
- `email` (VARCHAR) - Required
- `phone` (VARCHAR) - Optional
- `company_size` (VARCHAR) - Optional
- `message` (TEXT) - Optional
- `ip_address` (INET) - Audit trail
- `user_agent` (TEXT) - Audit trail
- `referrer` (TEXT) - Audit trail
- `submitted_at` (TIMESTAMPTZ) - Auto-generated
- `status` (VARCHAR) - Default 'new'

### Environment Variables

Required for database connectivity:

```bash
# PostgreSQL connection string (via Tailscale Funnel)
POSTGRES_URL="postgresql://canopy_vercel:PASSWORD@postgres-dev-canopy.tailnet-name.ts.net:5432/canopy_website?sslmode=require"

# Optional: For email fallback notifications
RESEND_API_KEY="re_xxxxxxxx"
```

Optional branding:

```bash
# Logo variant selection: hex (default) or leafy
PUBLIC_LOGO_VARIANT=hex
```

### Setup Instructions

1. **Apply K8s resources** (in canopy-k8s-configs repo):
   ```bash
   kubectl apply -k canopy-dev/postgres/
   ```

2. **Create database user** (run once):
   ```sql
   CREATE USER canopy_vercel WITH PASSWORD 'your-secure-password';
   GRANT CONNECT ON DATABASE canopy_website TO canopy_vercel;
   GRANT USAGE ON SCHEMA public TO canopy_vercel;
   GRANT SELECT, INSERT ON demo_submissions TO canopy_vercel;
   GRANT USAGE, SELECT ON SEQUENCE demo_submissions_id_seq TO canopy_vercel;
   ```

3. **Add Vercel environment variables**:
   ```bash
   vercel env add POSTGRES_URL
   vercel env add RESEND_API_KEY  # optional
   ```

### Fallback Behavior

If database connection fails:
1. Form still returns success to user
2. Data is sent via email as backup
3. Error is logged for investigation

## Colors

- Primary: `#00D4FF` (Electric Blue)
- Background: `#0A1628` (Dark Navy)
- Accent: `#0099CC` (Blue Dark)