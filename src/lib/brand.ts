export type LogoVariant = 'hex' | 'leafy';

const defaultLogoVariant: LogoVariant = 'hex';
const envLogoVariant = import.meta.env.PUBLIC_LOGO_VARIANT;

const resolvedLogoVariant: LogoVariant =
  envLogoVariant === 'hex' || envLogoVariant === 'leafy'
    ? envLogoVariant
    : defaultLogoVariant;

export const logoVariant = resolvedLogoVariant;

export const logos = {
  hex: {
    badge: '/logos/hex/badge.svg',
    icon: '/logos/hex/icon.svg',
    wordmark: '/logos/hex/wordmark.svg',
    full: '/logos/hex/full.svg',
    favicon: '/logos/hex/favicon.svg',
  },
  leafy: {
    badge: '/logos/leafy/badge.svg',
    icon: '/logos/leafy/icon.svg',
    wordmark: '/logos/leafy/wordmark.svg',
    full: '/logos/leafy/full.svg',
    favicon: '/logos/leafy/favicon.svg',
  },
} as const;

export const activeLogos = logos[logoVariant];
