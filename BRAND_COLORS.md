# Canopy Brand Colors

## Primary Palette

| Color | Hex | Usage |
|-------|-----|-------|
| **Primary Green** | `#22C55E` | Leaf icon, CANOPY text, primary brand identity |
| **Light Green** | `#4ADE80` | Green gradient end, hover states, highlights |
| **Dark Background** | `#0B1120` | Deep navy page background |
| **Darker Background** | `#070F1A` | Gradient end, deeper sections |
| **Card Background** | `#111D2F` | Glass cards, elevated surfaces |

## Accent Palette

| Color | Hex | Usage |
|-------|-----|-------|
| **Electric Blue** | `#00D4FF` | Circuit/tech accents, links, interactive UI elements |
| **Secondary Blue** | `#0099CC` | Blue gradient end, secondary accents |

## Design Philosophy

Canopy's visual identity combines **nature (green)** with **technology (blue)**:

- **Green** represents growth, the canopy/leaf brand mark, and the CANOPY wordmark
- **Electric Blue** represents technology, circuit roots, network nodes, and interactive UI
- The logo pairs a green leaf with blue circuit-board roots to symbolize nature-powered technology

## Logo Gradients

- **Leaf & Text Gradient**: `#22C55E` -> `#4ADE80` (135deg)
- **Circuit/Tech Gradient**: `#00D4FF` -> `#0099CC` (135deg)

## CSS variables (design tokens)

The site no longer declares its own `@theme` block. `src/styles/global.css` imports
`@canopy-ag/react-ui/tokens.css`, the Style-Dictionary build shared with the
product app, which defines the palette as `--canopy-*` custom properties inside a
Tailwind v4 `@theme` block:

```css
--canopy-green        /* #22C55E */
--canopy-green-light  /* #4ADE80 */
--canopy-green-dark
--canopy-blue         /* #00D4FF */
--canopy-blue-dark    /* #0099CC */
--canopy-blue-light
--canopy-dark         /* #0B1120 */
--canopy-darker       /* #070F1A */
--canopy-card         /* #111D2F */
```

Use them as `var(--canopy-green)` in `.astro` and CSS. The token source of truth is
`react/ui/src/tokens/tokens.json` in `canopy-roost`; change colors there and
release the package rather than editing this file alone. The hex values in this
document are a reference for design tools and must match that source.

## Selection & Glow Effects

- **Green selection**: `rgba(34, 197, 94, 0.3)` for text selection
- **Green glow**: `rgba(34, 197, 94, 0.15)` for card shadows
- **Blue glow**: `rgba(0, 212, 255, 0.15)` for tech element shadows

## Monochrome mark (night and light)

Canopy's light green `#4ADE80` and electric blue `#00D4FF` are tuned for a dark
navy backdrop. Against a pale background they wash out, so the colour mark is
kept for **dark** only and a greyscale mark is used under **night** and
**light**.

| Theme | Mark |
|---|---|
| `dark` (today, and the default when no `data-theme` is set) | colour |
| `night` | mono |
| `light` | mono |

### One asset, both backgrounds

`public/logos/{hex,leafy}/mono/badge.svg` is a single file per variant. The
outline and leaf take `currentColor`, and the interior detail (the hex mark's
leaf veins, the leafy mark's whole plant) is punched **out** through an SVG
mask rather than painted. The page background therefore shows through the
detail, and one file reads as white on black under night and as near black on
white under light. There is no second tinted copy to keep in sync.

The mark is painted through a CSS mask, not an `<img>`:

```css
.brand-mark-mono {
  background-color: currentColor;
  mask: var(--brand-mono-mark) center / contain no-repeat;
}
```

This matters. An SVG loaded through `<img>` is its own document, so
`currentColor` inside it resolves against *that* document rather than the page,
and the mark would render black on a black background. As a mask only the
alpha channel is used, the paint comes from `background-color`, and the mark
inherits the surrounding text colour for free.

Both marks ship in the DOM and CSS picks one, so switching theme involves no
JS swap and no second network fetch, and cannot flash.

### The favicon keeps brand colour

`<link rel="icon">` points at the **colour** mark in every theme, and does not
follow `data-theme`.

This reverses the original roadmap#149 decision, which shipped a grey favicon
everywhere on the reasoning that browser chrome cannot observe `data-theme`, so
one neutral mark beat carrying a JS swap path. The swap-path argument still
holds, but the conclusion was wrong: the tab icon is the most-seen instance of
the mark, and giving up its brand colour to serve a theme the chrome cannot
even see is a bad trade. A fixed colour mark reads against both light and dark
browser chrome, because the hex mark carries its own dark interior.

`public/logos/{hex,leafy}/mono/favicon.svg` is kept in the brand map
(`logos.<variant>.mono.favicon`) so the decision is one line to revisit, but
nothing references it today.

The in-page marks are unaffected: they DO follow `data-theme`, because they sit
on the page rather than in browser chrome.

The social card image (`full.svg`) keeps brand colour: it sits on its own
backdrop, not on the page.
