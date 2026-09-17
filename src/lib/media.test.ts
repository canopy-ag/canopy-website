import { describe, expect, it } from 'vitest';
import { isRemoteAllowed } from 'astro/assets/utils';
import astroConfig from '../../astro.config.mjs';
import {
  CAPTURED_SHOT_IDS,
  CDN_ORIGIN,
  MANIFEST_URL,
  PRODUCT_SECTIONS,
  SHOT_HEIGHT,
  SHOT_WIDTH,
  cdnUrl,
  shotKey,
  shotSrcset,
  shotUrl,
} from './media';

/**
 * #23 AC-1.
 *
 * Asserted against `isRemoteAllowed`, the function astro:assets itself calls to
 * decide whether a remote src is authorized, fed the real `image` block from
 * `astro.config.mjs`. A test that only grepped the config for the hostname
 * would pass on a misplaced or misspelled key that Astro ignores.
 */
/** U+2014, built from its code point so this file cannot contain one. */
const EM_DASH = new RegExp(String.fromCharCode(0x2014));

describe('#23 AC-1: astro authorizes cdn.canopy.ag as a remote image host', () => {
  const imageConfig = {
    domains: astroConfig.image?.domains ?? [],
    remotePatterns: astroConfig.image?.remotePatterns ?? [],
  };

  it('allows an https URL on the CDN host', () => {
    expect(isRemoteAllowed(`${CDN_ORIGIN}/irrigation-zones-dark@2x.png`, imageConfig)).toBe(true);
  });

  it('allows every URL the product page actually renders', () => {
    for (const section of PRODUCT_SECTIONS) {
      for (const scale of [1, 2] as const) {
        const url = shotUrl(section.id, 'dark', scale);
        expect(isRemoteAllowed(url, imageConfig), url).toBe(true);
      }
    }
  });

  it('allows the provenance manifest URL', () => {
    expect(isRemoteAllowed(MANIFEST_URL, imageConfig)).toBe(true);
  });

  // Negative control. If these passed, the first assertion would prove nothing:
  // an over-broad pattern authorizes the CDN by authorizing everything.
  it.each([
    'https://cdn.example.com/irrigation-zones-dark@1x.png',
    'https://canopy.ag/irrigation-zones-dark@1x.png',
    'https://evil-cdn.canopy.ag.attacker.test/x.png',
    'http://cdn.canopy.ag/irrigation-zones-dark@1x.png',
  ])('refuses %s', (url) => {
    expect(isRemoteAllowed(url, imageConfig)).toBe(false);
  });
});

describe('CDN key shape', () => {
  it('mirrors the publisher: bare filename, theme suffix, scale marker', () => {
    expect(shotKey('irrigation-zones', 'dark', 1)).toBe('irrigation-zones-dark@1x.png');
    expect(shotKey('irrigation-zones', 'dark', 2)).toBe('irrigation-zones-dark@2x.png');
    expect(shotKey('login', 'light', 1)).toBe('login-light@1x.png');
  });

  // Pinned to a real published-digests entry from canopy-roost#1566, so a
  // change to either side of the duplicated key shape fails here.
  it('reproduces a key the publisher has already emitted', () => {
    expect(shotKey('login', 'dark', 2)).toBe('login-dark@2x.png');
    expect(shotKey('forgot-password', 'light', 1)).toBe('forgot-password-light@1x.png');
  });

  it('builds absolute URLs on the CDN origin, with no double slash', () => {
    expect(cdnUrl('login-dark@1x.png')).toBe('https://cdn.canopy.ag/login-dark@1x.png');
    expect(new URL(shotUrl('tasks', 'dark', 1)).hostname).toBe('cdn.canopy.ag');
    expect(shotUrl('tasks', 'dark', 1)).not.toContain('//tasks');
  });

  it('offers both captured scales in a srcset', () => {
    expect(shotSrcset('devices', 'dark')).toBe(
      'https://cdn.canopy.ag/devices-dark@1x.png 1x, https://cdn.canopy.ag/devices-dark@2x.png 2x',
    );
  });

  it('puts the manifest at the bucket root, beside the assets', () => {
    expect(MANIFEST_URL).toBe('https://cdn.canopy.ag/manifest.json');
  });
});

describe('product page content', () => {
  // Provenance. A screenshot the capture pipeline never takes is a permanent
  // 404 that is indistinguishable from a slow CDN, so an invented id has to
  // fail here rather than in production.
  it('only references capture ids the pipeline produces', () => {
    for (const section of PRODUCT_SECTIONS) {
      expect(CAPTURED_SHOT_IDS, `unknown capture id: ${section.id}`).toContain(section.id);
    }
  });

  it('has no duplicate sections', () => {
    const ids = PRODUCT_SECTIONS.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every image alt text, as AGENTS.md requires', () => {
    for (const section of PRODUCT_SECTIONS) {
      expect(section.alt.trim().length, section.id).toBeGreaterThan(20);
      expect(section.title.trim()).not.toBe('');
      expect(section.body.trim()).not.toBe('');
    }
  });

  it('keeps site copy free of em dashes, emoji and exclamation marks', () => {
    for (const section of PRODUCT_SECTIONS) {
      const copy = `${section.title} ${section.body} ${section.alt}`;
      expect(copy, section.id).not.toMatch(EM_DASH);
      expect(copy, section.id).not.toMatch(/!/);
      expect(copy, section.id).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('reserves the capture viewport, so the frame is sized before any load', () => {
    expect(SHOT_WIDTH).toBe(1440);
    expect(SHOT_HEIGHT).toBe(900);
  });
});
