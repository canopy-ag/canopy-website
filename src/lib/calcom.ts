/**
 * Cal.com booking embed for the "Book a demo" CTA (src/components/BookDemo.astro).
 *
 * Canopy self-hosts Cal.com (the MIT Cal.diy build) at schedule.canopy.ag; see
 * canopy-k8s-configs docs/RUNBOOK-calcom.md. The embed library is served by that
 * instance at /embed/embed.js, so nothing loads from cal.com.
 *
 * Everything here is pure except loadCal(), so the URL and config rules are
 * covered by calcom.test.ts.
 */

export const CALCOM_ORIGIN = 'https://schedule.canopy.ag';

/** Cal namespace for every booker on this site. One namespace, one queue. */
export const CAL_NAMESPACE = 'demo';

/**
 * Campaign parameters forwarded from the page URL into the booker. Cal.com
 * records utm_* on the booking itself, and the Demo event type carries hidden
 * booking questions with these exact names so they also reach the webhook
 * payload that creates the ERPNext lead. Anything not listed is dropped.
 */
export const FORWARDED_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
] as const;

const MAX_PARAM_LENGTH = 200;

/**
 * The Cal link ("<user>/<event-slug>") for the Demo event, or null when the site
 * is not configured for it. A full URL is accepted and reduced to its path so
 * the env var can be pasted straight from the Cal.com UI.
 */
export function normalizeCalLink(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let link = raw.trim();
  if (/^https?:\/\//i.test(link)) {
    try {
      link = new URL(link).pathname;
    } catch {
      return null;
    }
  }
  link = link.replace(/^\/+|\/+$/g, '');
  // user/event, both segments slug-shaped. Anything else is a misconfiguration
  // that would render a broken iframe, so treat it as "not configured".
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(link) ? link : null;
}

/** Campaign params present on the current page, trimmed and length-capped. */
export function campaignParams(search: string | URLSearchParams): Record<string, string> {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const out: Record<string, string> = {};
  for (const key of FORWARDED_PARAMS) {
    const value = params.get(key)?.trim();
    if (value) out[key] = value.slice(0, MAX_PARAM_LENGTH);
  }
  return out;
}

/** Config passed to Cal's inline/modal calls. Keys become booker query params. */
export function bookerConfig(search: string | URLSearchParams): Record<string, string> {
  return {
    layout: 'month_view',
    theme: 'dark',
    ...campaignParams(search),
  };
}

/** No-JS fallback: the booking page itself, carrying the same campaign params. */
export function bookingPageUrl(calLink: string, search: string | URLSearchParams = ''): string {
  const url = new URL(`/${calLink}`, CALCOM_ORIGIN);
  for (const [k, v] of Object.entries(campaignParams(search))) url.searchParams.set(k, v);
  return url.href;
}

/** Theme for the booker: the site's dark palette with the brand green as accent. */
export const CAL_UI = {
  theme: 'dark',
  hideEventTypeDetails: false,
  layout: 'month_view',
  cssVarsPerTheme: {
    dark: { 'cal-brand': '#22C55E' },
    light: { 'cal-brand': '#22C55E' },
  },
} as const;

type CalApi = ((...args: unknown[]) => void) & {
  loaded?: boolean;
  ns?: Record<string, (...args: unknown[]) => void>;
  q?: unknown[];
};

declare global {
  interface Window {
    Cal?: CalApi;
  }
}

/**
 * Cal.com's official embed snippet (calcom/cal.com packages/embeds/embed-snippet,
 * pinned at 54343aa685ae), unchanged apart from types. It queues calls until
 * embed.js arrives, so callers never wait on the network.
 */
function installSnippet(C: Window, A: string, L: string): void {
  const p = function (a: { q: unknown[] }, ar: unknown) {
    a.q.push(ar);
  };
  const d = C.document;
  C.Cal =
    C.Cal ||
    (function (this: unknown) {
      const cal = C.Cal as CalApi;
      // eslint-disable-next-line prefer-rest-params
      const ar = arguments;
      if (!cal.loaded) {
        cal.ns = {};
        cal.q = cal.q || [];
        d.head.appendChild(d.createElement('script')).src = A;
        cal.loaded = true;
      }
      if (ar[0] === L) {
        const api = function () {
          // eslint-disable-next-line prefer-rest-params
          p(api as unknown as { q: unknown[] }, arguments);
        } as CalApi;
        const namespace = ar[1];
        api.q = api.q || [];
        if (typeof namespace === 'string') {
          cal.ns![namespace] = cal.ns![namespace] || api;
          p(cal.ns![namespace] as unknown as { q: unknown[] }, ar);
          p(cal as { q: unknown[] }, ['initNamespace', namespace]);
        } else p(cal as { q: unknown[] }, ar);
        return;
      }
      p(cal as { q: unknown[] }, ar);
    } as CalApi);
}

/**
 * Install the snippet and initialise the namespace once per page. Calling this
 * is what starts the embed.js download, so components call it lazily (first
 * hover/focus/click for a modal, near-viewport for an inline booker).
 */
export function loadCal(): (...args: unknown[]) => void {
  if (!window.Cal?.ns?.[CAL_NAMESPACE]) {
    installSnippet(window, `${CALCOM_ORIGIN}/embed/embed.js`, 'init');
    window.Cal!('init', CAL_NAMESPACE, { origin: CALCOM_ORIGIN });
    window.Cal!.ns![CAL_NAMESPACE]('ui', CAL_UI);
  }
  return window.Cal!.ns![CAL_NAMESPACE];
}
