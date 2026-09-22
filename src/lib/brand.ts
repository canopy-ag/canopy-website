export type LogoVariant = 'hex' | 'leafy';

/** Every variant, so callers can iterate without restating the union. */
export const LOGO_VARIANTS = ['hex', 'leafy'] as const satisfies readonly LogoVariant[];

const defaultLogoVariant: LogoVariant = 'hex';
const envLogoVariant = import.meta.env.PUBLIC_LOGO_VARIANT;

const resolvedLogoVariant: LogoVariant =
  envLogoVariant === 'hex' || envLogoVariant === 'leafy'
    ? envLogoVariant
    : defaultLogoVariant;

export const logoVariant = resolvedLogoVariant;

/**
 * Logo paths per variant, resolved at BUILD time from PUBLIC_LOGO_VARIANT.
 *
 * `mono` carries the greyscale marks used under the night and light themes
 * (roadmap#149). Only `badge` and `favicon` have mono counterparts, because
 * those are the only marks whose background is the page: `full` is the social
 * card image, which sits on its own backdrop and keeps brand colour.
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
