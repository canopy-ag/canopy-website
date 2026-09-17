import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Contract tests for the legal + support surface.
 *
 * These exist because the bug they close was exactly this shape: the demo form
 * has been telling every visitor "you agree to our privacy policy" while no such
 * page existed. A rename or a delete must fail CI rather than silently
 * reproduce that.
 */

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = path.join(SRC, 'pages');

function page(name: string): string {
  const file = path.join(PAGES, `${name}.astro`);
  expect(existsSync(file), `${name}.astro is missing`).toBe(true);
  return readFileSync(file, 'utf8');
}

/** Every route the site's own pages can serve, derived from the filesystem. */
function routableFiles(): Set<string> {
  const names = new Set<string>();
  for (const entry of readdirSync(PAGES, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.astro')) {
      names.add(entry.name.replace(/\.astro$/, ''));
    }
    if (entry.isDirectory()) names.add(entry.name);
  }
  return names;
}

describe('legal and support pages', () => {
  it('[#24 AC-1] ships a real privacy, terms and support page', () => {
    for (const name of ['privacy', 'terms', 'support']) {
      const body = page(name);
      expect(body).toContain('<Layout');
      // Non-placeholder: real prose, not a stub.
      expect(body.length).toBeGreaterThan(1200);
      expect(body).not.toMatch(/lorem ipsum|TODO|coming soon|TBD/i);
    }
  });

  it('[#24 AC-2] links the demo form\'s privacy claim to the published policy', () => {
    const form = readFileSync(
      path.join(SRC, 'components', 'DemoForm.tsx'),
      'utf8',
    );
    // The sentence and the link must travel together: the sentence without the
    // link is the live bug this story closes.
    expect(form).toContain('privacy policy');
    const claim = form.slice(form.indexOf('By submitting'));
    expect(claim.slice(0, 400)).toContain('href="/privacy"');
  });

  it('[#24 AC-3] resolves every internal footer link to a page that exists', () => {
    const layout = readFileSync(
      path.join(SRC, 'layouts', 'Layout.astro'),
      'utf8',
    );
    const footer = layout.slice(layout.indexOf('<footer'));
    const hrefs = [...footer.matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(3);

    const routable = routableFiles();
    const unresolved = hrefs.filter((href) => {
      if (href === '/') return false;
      return !routable.has(href.replace(/^\//, '').split('/')[0]);
    });
    expect(unresolved, `footer links with no page: ${unresolved.join(', ')}`).toEqual([]);
  });

  it('[#24 AC-4] names a monitored support address on the support page', () => {
    const support = page('support');
    expect(support).toContain('hello@canopy.ag');
    expect(support).toMatch(/one working day/i);
  });

  it('[#24 AC-1] cross-links support and privacy so a request has somewhere to go', () => {
    expect(page('support')).toContain('href="/privacy"');
  });
  it('[#24 AC-1] keeps test files out of src/pages, which Astro routes', () => {
    // This file used to live in src/pages. Astro compiled it as a route and
    // server-rendered it during the build, which imported vitest and took the
    // whole static build down. Nothing under src/pages may be a test.
    const routed = readdirSync(PAGES).filter((f) => f.includes('.test.'));
    expect(routed, `test files are routes in Astro: ${routed.join(', ')}`).toEqual([]);
  });
});
