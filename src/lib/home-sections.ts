/**
 * Which sections of the home page are built.
 *
 * The site is static, so a flag is resolved once at build time and a section
 * that is off is never rendered. That matters for the partner-dependent
 * sections: a logo or quote we do not yet have approval to show must not
 * reach the published HTML at all, hidden or not.
 *
 * ## Changing what ships
 *
 * Edit `HOME_SECTION_DEFAULTS` and deploy. That is the production switch.
 *
 * ## Previewing without changing production
 *
 * Set `PUBLIC_HOME_SECTIONS` on a Vercel preview (or locally) to a comma list
 * applied on top of the defaults, left to right:
 *
 *   `logos,quote`   turn those on
 *   `-faq`          turn that off
 *   `all`           turn everything on (later entries still apply)
 *
 * An unknown id fails the build rather than being ignored.
 */

export const HOME_SECTION_IDS = [
  'logos',
  'how-it-works',
  'modules',
  'proof',
  'quote',
  'faq',
  'cta',
] as const;

export type HomeSectionId = (typeof HOME_SECTION_IDS)[number];

export type HomeSectionFlags = Readonly<Record<HomeSectionId, boolean>>;

export const HOME_SECTION_DEFAULTS: HomeSectionFlags = {
  /** Partner logo marquee. Off until partners approve being named. */
  logos: false,
  /** Sticky scroll story: see, decide, do. */
  'how-it-works': true,
  /** Swipeable rail of product modules, from `PRODUCT_SECTIONS`. */
  modules: true,
  /** Product facts that need nobody's permission. */
  proof: true,
  /** Beta grower quote, shown beside the facts. Off until approved. */
  quote: false,
  /** Questions growers ask. */
  faq: true,
  /** Closing call to action. */
  cta: true,
};

function isSectionId(value: string): value is HomeSectionId {
  return (HOME_SECTION_IDS as readonly string[]).includes(value);
}

export function resolveHomeSections(override: string | undefined): HomeSectionFlags {
  const flags: Record<HomeSectionId, boolean> = { ...HOME_SECTION_DEFAULTS };
  if (!override?.trim()) return flags;

  for (const raw of override.split(',')) {
    const entry = raw.trim();
    if (!entry) continue;

    if (entry === 'all') {
      for (const id of HOME_SECTION_IDS) flags[id] = true;
      continue;
    }

    const on = !entry.startsWith('-');
    const id = on ? entry : entry.slice(1);
    if (!isSectionId(id)) {
      throw new Error(
        `PUBLIC_HOME_SECTIONS: unknown home section "${id}". Known: ${HOME_SECTION_IDS.join(', ')}, all.`,
      );
    }
    flags[id] = on;
  }

  return flags;
}

/**
 * The flags this build uses. `env` is optional-chained because this module is
 * also imported outside Vite (by the Playwright specs), where it is undefined.
 */
export const homeSections: HomeSectionFlags = resolveHomeSections(
  import.meta.env?.PUBLIC_HOME_SECTIONS,
);
