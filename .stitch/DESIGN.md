---
name: Canopy (Marketing Website)
colors:
  surface: '#0B1120'
  surface-dim: '#070F1A'
  surface-bright: '#111D2F'
  surface-container: '#111D2F'
  on-surface: '#FFFFFF'
  on-surface-variant: '#D9D9D9'
  outline: '#1E3A5F'
  outline-variant: '#0A1628'
  primary: '#22C55E'
  on-primary: '#0B1120'
  primary-container: '#4ADE80'
  on-primary-container: '#0B1120'
  secondary: '#00D4FF'
  on-secondary: '#0B1120'
  secondary-container: '#0099CC'
  on-secondary-container: '#FFFFFF'
  tertiary: '#5CE1FF'
  on-tertiary: '#0B1120'
  error: '#DC2626'
  on-error: '#FFFFFF'
---

# Design System: Canopy (Marketing Website)
**Source of truth:** `src/styles/global.css` (Tailwind v4 `@theme`) + `BRAND_COLORS.md`. Astro 5 + Tailwind, deployed to Vercel.
**Theme:** Dark, single-mode. Shares the Canopy brand palette with the product app (`@canopy-ag/react-ui` tokens) but is a lighter, marketing-tuned subset.

> Natural-language brief for prompting Stitch (or any agent) to generate new marketing pages that match the live site. Keep hex codes exact; derived from the actual shipped `global.css`, not a Stitch mockup.

## 1. Visual Theme & Atmosphere

A **dark, glowing, tech-forward marketing aesthetic** built on the Canopy metaphor of *nature meets technology*. Deep navy backgrounds give a premium, nocturnal canvas; a vivid **leaf green** carries the brand identity (leaf mark, CANOPY wordmark, primary CTAs) while an **electric blue** signals circuitry, links, and interactive tech. The vibe is **airy and confident**: generous spacing, frosted-glass cards, soft brand-colored glows, and gradient text that makes headlines feel alive and "lit from within." Where the product console is dense and utilitarian, the website is its **spacious, expressive sibling** — same DNA, more breathing room and shine.

## 2. Color Palette & Roles

| Descriptive Name | Hex | Functional Role |
|---|---|---|
| **Canopy Green** | `#22C55E` | Primary brand — leaf icon, CANOPY wordmark, primary CTA, prose headings, selection/glow. |
| **Light Leaf Green** | `#4ADE80` | Gradient end, hover states, highlights. |
| **Electric Blue** | `#00D4FF` | Circuit/tech accents, links, secondary CTAs, interactive elements. |
| **Deep Cyan** | `#0099CC` | Blue gradient end, secondary/pressed accents. |
| **Midnight Navy** | `#0B1120` | Primary page background (top of the body gradient). |
| **Abyss Navy** | `#070F1A` | Gradient end, deeper sections. |
| **Slate Card** | `#111D2F` | Glass cards, elevated surfaces, code blocks. |

**Text:** Primary white; body copy `rgba(255,255,255,0.85)` (`.prose`). Headings render in Canopy Green or green gradient; links in Electric Blue.

**Brand gradients (135°):** Leaf/text `#22C55E → #4ADE80` · Circuit/tech `#00D4FF → #0099CC`. Page body `linear-gradient(180deg, #0B1120 → #070F1A)`.

**Selection & glow:** Green text selection `rgba(34,197,94,0.3)`; green glow `drop-shadow(0 0 40px rgba(34,197,94,0.25))` / text-shadow `0 0 40px rgba(34,197,94,0.5)`; blue tech glow `rgba(0,212,255,0.15)`.

## 3. Typography Rules

- **Family:** **Inter** (`system-ui` fallback stack) throughout — clean, modern, technical sans. (Note: unlike the product app, the marketing site does *not* use the Fraunces serif display face — it stays all-Inter for a crisp, neutral web voice.)
- **Weight:** Headings `600` semibold; CTAs/labels `600`; body `400`.
- **Hierarchy & color:** `.prose` headings are **Canopy Green** (`h1` 2.5em, `h2` 1.8em with a green-tinted underline), body at 1.8 line-height in soft white. Hero headlines frequently use **green gradient text** with a glow for emphasis.
- **Links:** Electric Blue with a translucent cyan underline that solidifies to `#00D4FF` on hover.

## 4. Component Stylings

* **Buttons:** Rounded `8px`. **Primary** (`.btn-primary`) = leaf-green gradient (`135deg #22C55E → #4ADE80`) with near-black `#0B1120` text, lifting on hover (`translateY(-1px)` + green glow `0 4px 20px rgba(34,197,94,0.4)`). **Secondary** (`.btn-secondary`) = transparent with a cyan border (`rgba(0,212,255,0.4)`) and electric-blue label, filling to `rgba(0,212,255,0.1)` on hover.
* **Cards / Containers:** **Glass** (`.glass`) = `rgba(17,29,47,0.6)` with `backdrop-filter: blur(12px)` and a faint cyan border (`rgba(0,212,255,0.1)`) that brightens to `0.3` on hover. Code blocks use Slate Card `#111D2F` with a cyan border, radius `12px`.
* **Links / Nav:** `.nav-link` uses an animated green underline that grows from 0 → full width on hover. Inline code chips are electric-blue text on a faint cyan wash.
* **Accents:** `.gradient-text` for green gradient headlines; `.glow` / `.glow-text` for brand-green bloom on hero art and headings.

## 5. Layout Principles

Spacious, **section-stacked marketing layout** on the navy body gradient — full-width hero, alternating content bands, and glass cards floating with soft depth. Whitespace is **generous** (the opposite of the dense product console), guiding attention to one message per band. Depth is communicated through **frosted glass, brand glows, and gradient text** rather than borders; smooth scroll and subtle hover motion (underline grows, buttons lift) keep it feeling responsive and alive. Corners are consistently rounded (8–12px); green leads the eye to action, blue marks anything interactive or technical.

---
*Code-derived from `src/styles/global.css` + `BRAND_COLORS.md`. To round-trip into Stitch, upload via the `stitch-upload-to-stitch` / `stitch-code-to-design` skills. To regenerate after a restyle, re-run the `stitch-extract-design-md` skill against `src/`.*
