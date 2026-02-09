# Canopy Website

A modern Astro website for Canopy — growing the future of agriculture.

## Tech Stack

- **Astro 5** — Static site generator
- **Astro Content Collections** — Type-safe Markdown/MDX content
- **Tailwind CSS v4** — Styling with electric blue (#00D4FF) theme
- **React** — Interactive components
- **Vercel** — Deployment

## Getting Started

```bash
# Install dependencies
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

## Colors

- Primary: `#00D4FF` (Electric Blue)
- Background: `#0A1628` (Dark Navy)
- Accent: `#0099CC` (Blue Dark)