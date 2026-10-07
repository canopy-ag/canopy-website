import { describe, expect, it } from 'vitest';
import {
  bookerConfig,
  bookingPageUrl,
  campaignParams,
  inlineNamespace,
  normalizeCalLink,
  parseDemoHosts,
} from './calcom';

describe('inlineNamespace', () => {
  it('gives each host a distinct, stable namespace', () => {
    expect(inlineNamespace('ermias/demo')).toBe('demo-ermias-demo');
    expect(inlineNamespace('caleb/demo')).toBe('demo-caleb-demo');
    expect(inlineNamespace('ermias/demo')).not.toBe(inlineNamespace('caleb/demo'));
  });
});

describe('parseDemoHosts', () => {
  it('parses named hosts in order', () => {
    expect(parseDemoHosts('Ermias:ermias/demo, Caleb:caleb/demo')).toEqual([
      { name: 'Ermias', calLink: 'ermias/demo' },
      { name: 'Caleb', calLink: 'caleb/demo' },
    ]);
  });

  it('accepts a pasted booking URL after the first colon', () => {
    expect(parseDemoHosts('Caleb:https://schedule.canopy.ag/caleb/demo/')).toEqual([
      { name: 'Caleb', calLink: 'caleb/demo' },
    ]);
  });

  it('drops malformed entries and duplicate links', () => {
    expect(parseDemoHosts('nolink, :ermias/demo, Bad:demo, A:ermias/demo, B:ermias/demo')).toEqual([
      { name: 'A', calLink: 'ermias/demo' },
    ]);
  });

  it('falls back to the single-host link, then to not configured', () => {
    expect(parseDemoHosts('', 'ermias/demo')).toEqual([{ name: '', calLink: 'ermias/demo' }]);
    expect(parseDemoHosts(undefined, undefined)).toEqual([]);
    expect(parseDemoHosts('junk', 'also junk')).toEqual([]);
  });
});

describe('normalizeCalLink', () => {
  it('accepts a user/event link', () => {
    expect(normalizeCalLink('sales/demo')).toBe('sales/demo');
  });

  it('reduces a pasted booking URL to its path', () => {
    expect(normalizeCalLink('https://schedule.canopy.ag/sales/demo/')).toBe('sales/demo');
  });

  it('treats empty or malformed values as not configured', () => {
    expect(normalizeCalLink(undefined)).toBeNull();
    expect(normalizeCalLink('')).toBeNull();
    expect(normalizeCalLink('demo')).toBeNull();
    expect(normalizeCalLink('a/b/c')).toBeNull();
    expect(normalizeCalLink('sales/demo?x=1')).toBeNull();
    expect(normalizeCalLink('javascript:alert(1)')).toBeNull();
  });
});

describe('campaignParams', () => {
  it('forwards only the allow-listed campaign params', () => {
    expect(
      campaignParams('?utm_source=linkedin&utm_campaign=q4&email=a@b.c&gclid=xyz&foo=bar'),
    ).toEqual({ utm_source: 'linkedin', utm_campaign: 'q4', gclid: 'xyz' });
  });

  it('drops blanks and caps length', () => {
    const long = 'x'.repeat(500);
    const out = campaignParams(`?utm_source=%20%20&utm_medium=${long}`);
    expect(out.utm_source).toBeUndefined();
    expect(out.utm_medium).toHaveLength(200);
  });
});

describe('bookerConfig', () => {
  it('always sets the dark month view and merges campaign params', () => {
    expect(bookerConfig('?utm_source=newsletter')).toEqual({
      layout: 'month_view',
      theme: 'dark',
      utm_source: 'newsletter',
    });
  });
});

describe('bookingPageUrl', () => {
  it('builds the no-JS fallback on the scheduler origin with campaign params', () => {
    expect(bookingPageUrl('sales/demo', '?utm_source=ad&other=1')).toBe(
      'https://schedule.canopy.ag/sales/demo?utm_source=ad',
    );
  });
});
