# Canopy website: agent guidelines

Read this before changing anything. `README.md` explains how the site works and
how to develop it; `CONTRIBUTING.md` is the writer's guide for blog posts. This
file is the short list of rules and traps that agents keep tripping on.

## Commands

```bash
export NODE_AUTH_TOKEN=<token with read:packages>   # GitHub Packages, for @canopy-ag/react-ui
npm install
npm run dev        # astro dev, drafts visible
npm test           # vitest over src/**/*.test.ts
npm run build      # astro check && astro build; the real gate
```

`gh auth token` does not carry `read:packages` by default. If install fails with a
403 "does not match expected scopes", run `gh auth refresh -h github.com -s read:packages`
first. A 401 means the token expired.

## Hard rules

- **No em dashes (U+2014) in `src/`.** Site CI greps every `.astro`, `.mdx`, `.md`,
  `.ts`, `.tsx`, and `.json` file under `src/` and fails on a hit. Use a comma,
  colon, or period. Apply the same rule to user-facing copy, metadata, accessible
  text, email templates, and content entries. Before committing:

  ```bash
  rg -n '\x{2014}' src public --glob '!*.mp4' --glob '!*.jpg' --glob '!*.png' --glob '!*.svg'
  ```

  It should print nothing.
- No emoji, no exclamation marks in site copy. Sentence case for titles, headings,
  and UI strings.
- Every image gets alt text. A post with `heroImage` must set `heroAlt` or the
  build fails.
- Dark theme only. Colors come from the palette in `BRAND_COLORS.md`; use
  `var(--canopy-*)` tokens (from `@canopy-ag/react-ui/tokens.css`) rather than
  inventing new hex values.
- Keep React to islands. `src/components/DemoForm.tsx` is the only one today.
  Pages, layouts, and blog components are `.astro`.
- Do not add a `tailwind.config.js`. Tailwind v4 is configured through CSS.
- Do not reintroduce a direct Postgres connection in the site. The demo form
  forwards to the ingest shim in `ingest/`; see README "Demo form and the ingest
  shim". If you change the submission shape, update both `src/lib/schema.ts` and
  the mirrored schema in `ingest/server.mjs`.

## Where things live

| Task | Touch |
|---|---|
| New page | `src/pages/<name>.astro` with `src/layouts/Layout.astro` |
| Blog post | `src/content/blog/<slug>/index.mdx` (copy `_template/`) |
| New MDX component for posts | `src/components/blog/*.astro`, register in `src/components/blog/mdx.ts` |
| Post list, sort, draft, related logic | `src/lib/blog/*.ts`, with a Vitest case beside it |
| Content schema | `src/content.config.ts` |
| Demo-form validation | `src/lib/schema.ts` and `ingest/server.mjs` together |
| Lead-database service | `ingest/`; image is published by `.github/workflows/ingest-image.yml`, deployed by a pin in `canopy-k8s-configs` |
| Logo or hero assets | `public/logos/<variant>/`, `public/hero/` (read the README there) |

## Verification before you say it is done

1. `npm test` passes.
2. `npm run build` passes locally. It runs `astro check`, validates every post's
   frontmatter and image paths, and catches most mistakes CI would.
3. The em-dash grep above prints nothing.
4. For anything visual, open the Vercel preview on the PR at desktop and phone
   widths. Drafts are visible on previews and hidden on production.

## Workflow

Branch from `main`, open a PR with a conventional-commit title (`feat(blog): ...`,
`fix: ...`, `docs: ...`, `ci: ...`, `chore: ...`), wait for Site CI and the Vercel
preview comment, then merge. `main` has no branch protection, so a green check is
a convention, not an enforced gate. Vercel deploys `main` to canopy.ag.
