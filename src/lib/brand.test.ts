import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOGO_VARIANTS, logos } from './brand';

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');

const read = (publicPath: string) =>
  readFileSync(join(PUBLIC_DIR, publicPath.replace(/^\//, '')), 'utf8');

/** Brand hexes the colour marks bake in. None may survive into a mono mark. */
const BRAND_HEXES = [
  '#00D4FF',
  '#4ADE80',
  '#0C1319',
  '#185337',
  '#54aa6b',
  '#3c9d92',
  '#0d141b',
];

/**
 * roadmap#149 AC-2, the half that is a fact about the assets rather than about
 * rendered markup. The DOM half (both marks present, CSS deciding which shows)
 * is asserted end to end in e2e/mono-mark.spec.ts, because it is a claim about
 * a real page and a stylesheet rather than about a module.
 */
describe('roadmap#149 AC-2 every variant ships a mono mark', () => {
  it.each(LOGO_VARIANTS)('%s exposes mono badge and favicon paths', (variant) => {
    expect(logos[variant].mono.badge).toBe(`/logos/${variant}/mono/badge.svg`);
    expect(logos[variant].mono.favicon).toBe(`/logos/${variant}/mono/favicon.svg`);
  });

  it.each(LOGO_VARIANTS)('%s mono badge is drawn with currentColor', (variant) => {
    const svg = read(logos[variant].mono.badge);
    expect(svg).toContain('currentColor');
  });

  it.each(LOGO_VARIANTS)('%s mono badge bakes no brand colour', (variant) => {
    const svg = read(logos[variant].mono.badge).toLowerCase();
    const baked = BRAND_HEXES.filter((hex) => svg.includes(hex.toLowerCase()));
    expect(baked).toEqual([]);
  });

  /**
   * The detail strokes have to be punched OUT rather than painted, so the page
   * background shows through. That is what lets one asset read on black and on
   * white without a second tinted copy.
   */
  it.each(LOGO_VARIANTS)('%s mono badge punches its detail out', (variant) => {
    expect(read(logos[variant].mono.badge)).toContain('<mask');
  });
});

/**
 * roadmap#149 AC-4. The favicon is the one mark that cannot use currentColor:
 * an SVG favicon is rendered by browser chrome, which has no host page to
 * inherit a colour from, so currentColor would resolve to its own initial
 * value and vanish against dark chrome. It carries a fixed mid grey instead.
 */
describe('roadmap#149 AC-4 the favicon is fixed, not themed', () => {
  it.each(LOGO_VARIANTS)('%s mono favicon avoids currentColor', (variant) => {
    expect(read(logos[variant].mono.favicon)).not.toContain('currentColor');
  });

  it.each(LOGO_VARIANTS)('%s mono favicon bakes no brand colour', (variant) => {
    const svg = read(logos[variant].mono.favicon).toLowerCase();
    expect(BRAND_HEXES.filter((h) => svg.includes(h.toLowerCase()))).toEqual([]);
  });
});
