# Canopy Logo Assets

This document describes the logo assets used across the Canopy website and brand.

## Variants

Logos live under `public/logos/<variant>/` where `<variant>` is `hex` or `leafy`.
Switch between variants with `PUBLIC_LOGO_VARIANT` (defaults to `hex`).

## Files

### `icon.svg`
- **Dimensions:** 48×48 viewBox
- **Use case:** Navigation bar, footer, small inline icons
- **Description:** Compact square icon with circuit and leaf elements

### `badge.svg`
- **Dimensions:** 256×256 viewBox
- **Use case:** Hero sections, feature highlights, large display contexts
- **Description:** Full badge-style icon with radial gradient background, circuit tree, and leaf

### `wordmark.svg`
- **Dimensions:** 1024×320 viewBox
- **Use case:** Full brand presentations, print materials, external documents
- **Description:** Horizontal layout combining the badge icon with "CANOPY" wordmark text

### `favicon.svg`
- **Dimensions:** 32×32 viewBox
- **Use case:** Browser tab icon, bookmarks, PWA icon
- **Description:** Optimized 32×32 version of logo-badge with scaled proportions

### `full.svg` (legacy)
- **Dimensions:** Varies
- **Use case:** Legacy reference (being phased out in favor of logo-wordmark.svg)
- **Description:** Previous full logo implementation

## Color Palette

### Primary Badge Colors
| Element | Type | Colors |
|---------|------|--------|
| Badge Background | Radial Gradient | `#0B6A43` → `#03583A` → `#013A29` |
| Leaf | Linear Gradient | `#32BA67` → `#1E9B4A` |
| Circuit | Solid | `#039E96` (teal) |

### Wordmark Colors
| Element | Type | Colors |
|---------|------|--------|
| Text | Linear Gradient | `#23B157` → `#1FAE55` |

### Legacy Brand Colors (UI)
Note: The logo colors above are refined versions of the site's UI brand colors:
- Primary Green: `#22C55E`
- Light Green: `#4ADE80`

## Usage Guidelines

1. **Navigation**: Use `icon.svg` at 36-48px
2. **Hero Sections**: Use `badge.svg` at 96-144px for visual impact
3. **Footer**: Use `icon.svg` at 28-32px
4. **Favicon**: Use `favicon.svg` (32×32 optimized)
5. **External/Print**: Use `wordmark.svg` for full brand representation

## Technical Notes

- All SVGs use `fill="none"` on the root element with explicit fills on child elements
- Gradients are defined within `<defs>` with unique IDs per file
- The favicon is a manually optimized version maintaining visual consistency at small sizes
- Font in wordmark uses: `Montserrat, Poppins, Inter, Arial, sans-serif`
