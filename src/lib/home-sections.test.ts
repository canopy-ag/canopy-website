import { describe, expect, it } from 'vitest';
import {
  HOME_SECTION_DEFAULTS,
  HOME_SECTION_IDS,
  resolveHomeSections,
} from './home-sections';

describe('home section flags', () => {
  it('ships partner-dependent sections off by default', () => {
    // Neither has partner approval yet. Turning one on is a deliberate edit.
    expect(HOME_SECTION_DEFAULTS.logos).toBe(false);
    expect(HOME_SECTION_DEFAULTS.quote).toBe(false);
  });

  it('ships every section that needs no approval on by default', () => {
    for (const id of ['how-it-works', 'modules', 'proof', 'faq', 'cta'] as const) {
      expect(HOME_SECTION_DEFAULTS[id], id).toBe(true);
    }
  });

  it('has a default for every id and nothing else', () => {
    expect(Object.keys(HOME_SECTION_DEFAULTS).sort()).toEqual([...HOME_SECTION_IDS].sort());
  });

  it('returns the defaults when there is no override', () => {
    expect(resolveHomeSections(undefined)).toEqual(HOME_SECTION_DEFAULTS);
    expect(resolveHomeSections('')).toEqual(HOME_SECTION_DEFAULTS);
    expect(resolveHomeSections('  ')).toEqual(HOME_SECTION_DEFAULTS);
  });

  it('turns a listed section on and a minus-prefixed one off', () => {
    const flags = resolveHomeSections('logos, -faq');
    expect(flags.logos).toBe(true);
    expect(flags.faq).toBe(false);
    expect(flags.modules).toBe(HOME_SECTION_DEFAULTS.modules);
  });

  it('turns everything on with "all", then applies later entries', () => {
    const flags = resolveHomeSections('all,-quote');
    for (const id of HOME_SECTION_IDS) {
      expect(flags[id], id).toBe(id !== 'quote');
    }
  });

  it('fails the build on an unknown id instead of ignoring it', () => {
    // A typo that silently did nothing would leave a preview showing the
    // production set while the reviewer believed otherwise.
    expect(() => resolveHomeSections('logo')).toThrow(/unknown home section "logo"/);
  });

  it('does not mutate the defaults', () => {
    resolveHomeSections('all');
    expect(HOME_SECTION_DEFAULTS.logos).toBe(false);
  });
});
