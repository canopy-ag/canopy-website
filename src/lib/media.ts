/**
 * Product media served from cdn.canopy.ag.
 *
 * Screenshots are captured in canopy-roost (`e2e/media/`) and published to the
 * R2 bucket behind `cdn.canopy.ag` by `npm run media:publish` there. This
 * module is the website's single source of truth for how a capture id becomes
 * a CDN URL, so a screenshot reference is traceable back to the run that
 * produced it rather than being a hand-written link.
 *
 * ## Key shape, and why it is not composed here
 *
 * The publisher mirrors its capture tree into the bucket verbatim: an asset in
 * the `product` family lives at the tree root, so its bucket key is a bare
 * filename. Captures expand one declaration into a light and a dark entry, at
 * scale 1 and 2:
 *
 *   `<capture-id>-<theme>@<scale>x.png`
 *
 * That shape mirrors `MEDIA_FAMILIES.product` and the `expand()` helper in
 * `canopy-roost/e2e/media/shots.ts`. It is duplicated here rather than shared,
 * because the two repos release independently and a published bucket has to be
 * readable by a site that was built before the capture ran. `media.test.ts`
 * pins the shape so the duplication cannot drift silently.
 *
 * ## A PARTLY filled bucket is the current state, and is supported
 *
 * The first publish landed 2026-09-18 (canopy-roost media-capture run
 * 35390366680, 41 objects). It does NOT mean every URL below resolves. Two of
 * the fourteen ids are live — `login` and `forgot-password`, the only routes
 * that render without a session — and the other twelve still answer 404
 * because they are `demo` tier and need the Canopy Creek Farms tenant seeded
 * on dev first.
 *
 * That split is the important part: "published" is per-asset, not per-bucket,
 * and every section of `/product` currently points at one of the twelve. So
 * nothing here fetches at build time, exactly as before — see
 * `ProductShot.astro` for how the page stays deliberate while an image is
 * absent. Verified by curl against the live CDN on 2026-09-18.
 */

/** Origin of the Cloudflare R2 bucket `canopy-media`. */
export const CDN_ORIGIN = 'https://cdn.canopy.ag';

/**
 * Provenance manifest, published beside the assets at the bucket root. Maps a
 * capture id to the commit, app version and capture time that produced it, so
 * "is this screenshot current?" is a checkable question. Not fetched at build
 * time: the site must build whether or not a capture has ever run.
 */
export const MANIFEST_URL = `${CDN_ORIGIN}/manifest.json`;

/** Capture viewport, in CSS pixels, before the device scale factor. */
export const SHOT_WIDTH = 1440;
export const SHOT_HEIGHT = 900;

/** The site is dark only, so dark is the variant it consumes. */
export type Theme = 'light' | 'dark';

/** Device pixel ratios the capture pipeline emits. */
export type Scale = 1 | 2;

/**
 * Capture ids the `product` family actually produces, in shot-list order.
 *
 * This exists so the page cannot advertise a screenshot the pipeline never
 * takes. A typo or an invented id is a failing unit test, not a permanent 404
 * that looks like a slow CDN.
 */
export const CAPTURED_SHOT_IDS = [
  'login',
  'forgot-password',
  'irrigation-zones',
  'irrigation-schedules',
  'irrigation-pumps',
  'irrigation-topology',
  'plants-inventory',
  'plants-varieties',
  'labor-log',
  'tasks',
  'devices',
  'farm',
  'schedule',
  'map',
] as const;

export type CapturedShotId = (typeof CAPTURED_SHOT_IDS)[number];

/** Bucket key for one capture, at one theme and scale. */
export function shotKey(id: CapturedShotId, theme: Theme, scale: Scale): string {
  return `${id}-${theme}@${scale}x.png`;
}

/** Absolute CDN URL for a bucket key. */
export function cdnUrl(key: string): string {
  return `${CDN_ORIGIN}/${key}`;
}

/** Absolute CDN URL for one capture, at one theme and scale. */
export function shotUrl(id: CapturedShotId, theme: Theme, scale: Scale): string {
  return cdnUrl(shotKey(id, theme, scale));
}

/**
 * A `srcset` covering both captured scales, so a retina display gets the 2x
 * file without the 1x file being oversized everywhere else.
 */
export function shotSrcset(id: CapturedShotId, theme: Theme): string {
  return `${shotUrl(id, theme, 1)} 1x, ${shotUrl(id, theme, 2)} 2x`;
}

/** One screenshot-led section of the product page. */
export interface ProductSection {
  /** Capture id. Must be one the pipeline produces. */
  readonly id: CapturedShotId;
  /** Section heading, sentence case. */
  readonly title: string;
  /** Supporting copy, one or two sentences. */
  readonly body: string;
  /** Alt text describing the screenshot, required on every image. */
  readonly alt: string;
}

/**
 * The page, as data. Order is the narrative: what a grower schedules, then the
 * work that follows from it, then what the work is done to, then the hardware
 * underneath, then where all of it sits.
 *
 * ⚠ Every entry names a `demo` tier capture, which needs the Canopy Creek
 * Farms tenant seeded before it can be taken. All six answer 404 as of
 * 2026-09-18 and render as reserved placeholders rather than broken images.
 *
 * The two ids that ARE published — `login` and `forgot-password` — are
 * deliberately not listed here. They are auth screens, and a product page that
 * led with them would be advertising the front door instead of the building.
 * They exist so the pipeline can be proven end-to-end without a tenant, which
 * is the job they did.
 *
 * Do NOT substitute a `showcase` asset for a missing one. Those are
 * design-system gallery pages, and `canopy-roost/e2e/media/shots.ts` namespaces
 * them away from product shots precisely because `page-layout` in particular
 * "is exactly the image someone would reach for as a product screenshot, and
 * exactly the claim the product does not support".
 */
export const PRODUCT_SECTIONS: readonly ProductSection[] = [
  {
    id: 'irrigation-zones',
    title: 'Every zone in one view',
    body: 'Zones carry their own mode, clamps and flow limits, so what is safe for a propagation house is not what is safe for a finished block. Status is current, not a nightly roll-up.',
    alt: 'Canopy irrigation zones screen listing zones with their mode, status and flow limits.',
  },
  {
    id: 'irrigation-schedules',
    title: 'Schedules that follow the weather',
    body: 'Build a sequence once and let evapotranspiration move it. Canopy adjusts run times against local weather rather than asking someone to remember to.',
    alt: 'Canopy irrigation schedules screen showing a watering sequence and its run times.',
  },
  {
    id: 'tasks',
    title: 'Work that reaches the crew',
    body: 'A decision that stays on a dashboard is not a decision. Tasks carry priority, assignment and due date, so the plan and the shift are the same thing.',
    alt: 'Canopy tasks screen listing assigned work with priority and due dates.',
  },
  {
    id: 'plants-inventory',
    title: 'Know what is on the ground',
    body: 'Inventory tracks varieties, counts and location down to the block, so a sales call and a production plan draw on the same numbers.',
    alt: 'Canopy plant inventory screen listing varieties with counts and locations.',
  },
  {
    id: 'devices',
    title: 'The hardware, accounted for',
    body: 'Controllers, sensors and relay modules report in with their connection state. When a device goes quiet you find out from Canopy, not from a dry block.',
    alt: 'Canopy devices screen listing connected controllers and sensors with their status.',
  },
  {
    id: 'map',
    title: 'Your operation, in place',
    body: 'Blocks, houses and zones drawn where they actually are. Geography is how growers already think about their site, so it is how Canopy shows it.',
    alt: 'Canopy map screen showing farm blocks and irrigation zones drawn over satellite imagery.',
  },
];
