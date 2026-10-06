/**
 * Copy and data for the home page sections below the hero.
 *
 * Whether a section renders at all is decided by `home-sections.ts`. The data
 * here is what it renders when it does. Two sections also refuse to render
 * when their data is empty, so turning a flag on before the content exists
 * produces nothing rather than an empty frame:
 *
 * - `PARTNERS` empty: no logo marquee.
 * - `BETA_QUOTE` null: no quote card (the product facts still show).
 *
 * Every claim here should be one the product supports today. If a line is not
 * true yet, it does not belong on the page.
 */
import type { CapturedShotId } from './media';

/** A partner or beta customer who has approved being named. */
export interface Partner {
  readonly name: string;
  /** Path under /public, ideally a single-colour SVG. */
  readonly logo: string;
  readonly href?: string;
}

/**
 * Empty until partners approve. Add an entry and turn on the `logos` flag.
 * Do not add a name here before written approval: the list is the gate.
 */
export const PARTNERS: readonly Partner[] = [];

export interface Quote {
  readonly text: string;
  readonly name: string;
  readonly role: string;
  readonly organization: string;
}

/** Null until a beta grower approves the wording and the attribution. */
export const BETA_QUOTE: Quote | null = null;

/** One step of the "how it works" scroll story. */
export interface StoryStep {
  readonly verb: string;
  readonly title: string;
  readonly body: string;
  readonly shot: CapturedShotId;
  readonly alt: string;
}

export const STORY_STEPS: readonly StoryStep[] = [
  {
    verb: 'See',
    title: 'The whole operation, as it is right now',
    body: 'Every zone shows its mode and status, and the on-farm device reports its connection. When it goes quiet you find out from Canopy, not from a dry block.',
    shot: 'irrigation-zones',
    alt: 'Canopy irrigation zones screen showing each zone with its mode and status.',
  },
  {
    verb: 'Decide',
    title: 'Schedules that follow the weather',
    body: 'Each morning Canopy recalculates run times from yesterday\'s evapotranspiration and rainfall, scaled from each zone\'s own leaching-fraction test.',
    shot: 'irrigation-schedules',
    alt: 'Canopy irrigation schedules screen listing sequences with run times.',
  },
  {
    verb: 'Do',
    title: 'Work that reaches the crew',
    body: 'Tasks carry a zone, a time window, a headcount and a priority. They are scheduled around irrigation and show up for the crew in the mobile app.',
    shot: 'tasks',
    alt: 'Canopy tasks screen listing work by zone with priority and time windows.',
  },
];

/** A product fact for the proof strip. Short value, plain label. */
export interface ProofFact {
  readonly value: string;
  readonly label: string;
}

export const PROOF_FACTS: readonly ProofFact[] = [
  { value: 'Daily', label: 'run times recalculated from local ET and rainfall' },
  { value: 'Offline', label: 'the on-farm device keeps running its schedule without internet' },
  { value: 'Per zone', label: 'mode and runtime limits, set zone by zone' },
  { value: 'In the field', label: "today's tasks on a mobile app that works offline" },
];

export interface FaqItem {
  readonly question: string;
  /** Plain text. Rendered as a paragraph and as FAQPage structured data. */
  readonly answer: string;
}

/*
 * TODO(founder): two questions growers will ask that only you can answer.
 * Add them here once decided; nothing is published until then.
 *   - "What does Canopy cost?" (precision scheduling and the assistant are paid features)
 *   - "What is in the beta, and how long does it run?"
 * Also hold any question about the AI connector until its availability and
 * read/write posture are settled (connect.astro and the product docs disagree).
 */
export const FAQ_ITEMS: readonly FaqItem[] = [
  {
    question: 'Who is Canopy for?',
    answer:
      'Nurseries and growing operations that run irrigation zones and crews across one or more sites. Canopy models your operation the way you already think about it: sites, optional blocks, and the zones inside them.',
  },
  {
    question: 'What hardware do I need?',
    answer:
      'One Canopy device per site, wired to relay boards that switch your valves. Our team installs and pairs the device and maps each relay to its valve. If you already run an irrigation controller, tell us about it on the demo call and we will walk through how your site would be set up.',
  },
  {
    question: 'What happens if the internet goes down?',
    answer:
      'Irrigation keeps running. The on-farm device holds its schedule and carries on without a connection, and it serves a local page on your farm network so you can see what it is doing.',
  },
  {
    question: 'How does weather-based scheduling work?',
    answer:
      "Once a day, Canopy takes yesterday's evapotranspiration and rainfall for your site and scales each zone's runtime from its own leaching-fraction test. Rain is subtracted and the result stays inside the limits you set for the zone. Weather comes from a public forecast service by default, or from your own Ambient Weather station.",
  },
  {
    question: 'How does work reach the crew?',
    answer:
      'Tasks are tied to a zone and carry a time window, a duration, a headcount and a priority. Canopy schedules them around irrigation runs, and your crew sees the day in the mobile app, which keeps working without signal and syncs when it reconnects.',
  },
  {
    question: 'Who can see our data?',
    answer:
      'Only your organization. Every request is checked on the server against the organization it belongs to, and users have viewer, operator or administrator roles. Labor is recorded as hours by work type, so Canopy does not store wages or personal worker details. Your data is available to your own systems through the Canopy API.',
  },
  {
    question: 'How do we get started?',
    answer:
      'Request a demo and walk us through your site. If it is a fit, we set up your organization and administrator account, install the on-farm device, map your relays to valves and set up your work types with you.',
  },
];
