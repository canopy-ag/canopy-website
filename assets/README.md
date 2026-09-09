# Canopy logo assets

Logo files the site serves live under `public/logos/<variant>/`, not in this
folder. This document describes what is there and how the site picks a set.

## Variants

Two sets exist, `hex` and `leafy`. `src/lib/brand.ts` selects one from
`PUBLIC_LOGO_VARIANT` (default `hex`) and exposes `activeLogos`, which
`src/layouts/Layout.astro` uses for the nav badge, footer badge, and favicon.

| Variant | Design | Artwork viewBox | Colors in the SVG |
|---|---|---|---|
| `hex` | Hex badge with leaf and circuit accent | `30 30 340 389` | leaf `#4ADE80`, circuit stroke `#00D4FF`, outline `#0C1319` |
| `leafy` | Circular leafy node badge | `0 0 500 500` | fills `#185337`, `#54aa6b`, `#0d141b`; stroke `#3c9d92` |

## Files per variant

Each variant folder has the same five names, and today they all contain the
**same artwork**. `badge.svg`, `icon.svg`, `favicon.svg`, `full.svg`, and
`wordmark.svg` are byte-identical within a variant. The names are placeholders
for a future set where the wordmark carries the CANOPY text and the favicon is
simplified for 16 to 32 px. Until then, treat them as one mark.

| File | Intended use | Where it is used now |
|---|---|---|
| `badge.svg` | Primary mark | Nav (36 px, `w-9 h-9`) and footer (28 px, `w-7 h-7`) |
| `favicon.svg` | Browser tab | `<link rel="icon">` in `Layout.astro` |
| `icon.svg` | Square icon contexts | Not referenced by the site yet |
| `wordmark.svg` | Horizontal lockup with text | Placeholder, icon only |
| `full.svg` | Full lockup | Placeholder, icon only |

Sizing guidance in the per-variant READMEs (`public/logos/hex/README.md`,
`public/logos/leafy/README.md`) matches the table above.

## Adding or replacing a logo

1. Export SVGs with a stable `viewBox` and no embedded raster.
2. Keep gradient and mask `id`s unique per file if you inline them anywhere.
3. Drop them into `public/logos/<variant>/` with the same five names.
4. Run `npm run dev` and check the nav, footer, and browser tab at both variants:

   ```bash
   PUBLIC_LOGO_VARIANT=leafy npm run dev
   ```

The wider brand palette (UI greens, blues, navies) is documented in
`BRAND_COLORS.md`; the values inside the logo SVGs are tuned for the mark and do
not have to match the UI tokens exactly.
