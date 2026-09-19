#!/usr/bin/env node
/**
 * Which `/product` screenshots actually exist on cdn.canopy.ag right now.
 *
 * The page cannot answer this for itself. `ProductShot` deliberately defers
 * every fetch to the browser, so an id that 404s renders as a reserved
 * placeholder and looks, from the outside, exactly like one that has not
 * loaded yet. That is the right behaviour for visitors and a bad one for
 * whoever is trying to find out whether the imagery has landed.
 *
 * Run it to answer two questions:
 *
 *   1. Can `/product` show real screenshots yet? (every section id live)
 *   2. Is it safe to switch `ProductShot` to `<Image />`? — same condition,
 *      because `astro:assets` fetches at build time and one 404 reds the build.
 *
 * Reads the published manifest rather than probing each URL: the manifest is
 * the publisher's own record of what it wrote, so a key present there but
 * unreachable is a CDN problem worth distinguishing from an unpublished shot.
 * Both are reported, separately.
 *
 *   node scripts/check-media-published.mjs
 *
 * Exits non-zero when any section id is missing, so it can gate a future
 * "switch to <Image />" change instead of that being a judgement call.
 */
import { CAPTURED_SHOT_IDS, MANIFEST_URL, PRODUCT_SECTIONS, shotUrl } from '../src/lib/media.ts';

const res = await fetch(MANIFEST_URL);
if (!res.ok) {
  console.error(`manifest unreachable: HTTP ${res.status} at ${MANIFEST_URL}`);
  process.exit(2);
}
const manifest = await res.json();
const published = new Set((manifest.assets ?? []).map((a) => a.id));

console.log(`manifest ${MANIFEST_URL}`);
console.log(
  `  sha ${String(manifest.sha).slice(0, 10)}  captured ${manifest.capturedAt}  ${published.size} id(s)\n`,
);

const sectionIds = PRODUCT_SECTIONS.map((s) => s.id);
const missing = [];

for (const id of CAPTURED_SHOT_IDS) {
  const onPage = sectionIds.includes(id);
  const live = published.has(`${id}-dark`) || published.has(id);
  if (onPage && !live) missing.push(id);
  console.log(
    `  ${live ? 'LIVE   ' : 'ABSENT '} ${id.padEnd(22)} ${onPage ? '← /product' : ''}`,
  );
}

// A key the manifest claims but the CDN will not serve is a different failure
// from one that was never captured, and conflating them sends you to the wrong
// repo. Only checked for ids the page actually needs.
const unreachable = [];
for (const id of sectionIds) {
  if (!published.has(`${id}-dark`)) continue;
  const head = await fetch(shotUrl(id, 'dark', 1), { method: 'HEAD' });
  if (!head.ok) unreachable.push(`${id} (HTTP ${head.status})`);
}

console.log();
if (unreachable.length > 0) {
  console.error(`in the manifest but not served: ${unreachable.join(', ')}`);
  console.error('That is a CDN/bucket problem, not a missing capture.');
  process.exit(1);
}
if (missing.length > 0) {
  console.error(`/product references ${missing.length} unpublished shot(s):`);
  console.error(`  ${missing.join(', ')}`);
  console.error(
    '\nThese are `demo` tier and need the Canopy Creek Farms tenant seeded on\n' +
      'dev before they can be captured. See canopy-roost docs/DEMO-TENANT-SEEDING.md.\n' +
      'Until then /product renders reserved placeholders, and ProductShot must\n' +
      'stay on a plain <img>.',
  );
  process.exit(1);
}
console.log('every /product section has a published screenshot.');
console.log('ProductShot can move to <Image />; the build-time fetch will resolve.');
