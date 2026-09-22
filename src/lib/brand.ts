export type LogoVariant = 'hex' | 'leafy';

/** Every variant, so callers can iterate without restating the union. */
export const LOGO_VARIANTS = ['hex', 'leafy'] as const satisfies readonly LogoVariant[];

const defaultLogoVariant: LogoVariant = 'hex';
/*
 * `import.meta.env` only exists under Vite, which Astro and vitest both run
 * through. Playwright does not: e2e specs are loaded by plain Node, so reading
 * a property off it there throws before any test runs. The optional chain lets
 * this module be imported from an e2e spec, which is what keeps the expected
 * logo paths shared with the source rather than restated as literals.
 */
const envLogoVariant = import.meta.env?.PUBLIC_LOGO_VARIANT;

const resolvedLogoVariant: LogoVariant =
  envLogoVariant === 'hex' || envLogoVariant === 'leafy'
    ? envLogoVariant
    : defaultLogoVariant;

export const logoVariant = resolvedLogoVariant;

/**
 * Logo paths per variant, resolved at BUILD time from PUBLIC_LOGO_VARIANT.
 *
 * `mono` carries the greyscale marks used under the night and light themes
 * (roadmap#149). `badge` is the one in use: it sits on the page, so it follows
 * `data-theme`.
 *
 * `mono.favicon` is deliberately UNUSED. The tab icon keeps brand colour in
 * every theme, because browser chrome cannot observe `data-theme` and trading
 * the most-seen instance of the mark for a theme it cannot see is a bad trade.
 * It is kept here so that decision is one line to revisit.
 *
 * `full` has no mono counterpart: it is the social card image, which sits on
 * its own backdrop rather than the page, and keeps brand colour.
 *
 * The per-mode CHOICE is not made here. This module runs once at build time
 * and cannot know a visitor's theme, so both marks are rendered and CSS keyed
 * on `[data-theme]` decides which is visible.
 */
export const logos = {
  hex: {
    badge: '/logos/hex/badge.svg',
    icon: '/logos/hex/icon.svg',
    wordmark: '/logos/hex/wordmark.svg',
    full: '/logos/hex/full.svg',
    favicon: '/logos/hex/favicon.svg',
    mono: {
      badge: '/logos/hex/mono/badge.svg',
      favicon: '/logos/hex/mono/favicon.svg',
    },
  },
  leafy: {
    badge: '/logos/leafy/badge.svg',
    icon: '/logos/leafy/icon.svg',
    wordmark: '/logos/leafy/wordmark.svg',
    full: '/logos/leafy/full.svg',
    favicon: '/logos/leafy/favicon.svg',
    mono: {
      badge: '/logos/leafy/mono/badge.svg',
      favicon: '/logos/leafy/mono/favicon.svg',
    },
  },
} as const;

export const activeLogos = logos[logoVariant];
