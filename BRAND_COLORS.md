# Canopy Brand Colors

Source of truth for brand color tokens used across the marketing site.

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

## CSS Variables (Tailwind @theme)

```css
--color-canopy-green: #22C55E;
--color-canopy-green-light: #4ADE80;
--color-canopy-blue: #00D4FF;
--color-canopy-blue-dark: #0099CC;
--color-canopy-dark: #0B1120;
--color-canopy-darker: #070F1A;
--color-canopy-card: #111D2F;
```

## Selection & Glow Effects

- **Green selection**: `rgba(34, 197, 94, 0.3)` for text selection
- **Green glow**: `rgba(34, 197, 94, 0.15)` for card shadows
- **Blue glow**: `rgba(0, 212, 255, 0.15)` for tech element shadows
