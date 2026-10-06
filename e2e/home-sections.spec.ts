import { expect, test, type Page } from '@playwright/test';
import { FAQ_ITEMS, STORY_STEPS } from '../src/lib/home-content';
import { HOME_SECTION_IDS, resolveHomeSections } from '../src/lib/home-sections';

/**
 * The home page below the hero: the sections a build ships, and how they
 * behave. Runs against the production build, so it sees exactly what the
 * flags let through. Screenshots are blocked so nothing here depends on what
 * the CDN holds.
 */

const expected = resolveHomeSections(process.env.PUBLIC_HOME_SECTIONS);

async function blockCdn(page: Page) {
  await page.route('https://cdn.canopy.ag/**', (route) => route.fulfill({ status: 404 }));
}

test.beforeEach(async ({ page }) => {
  await blockCdn(page);
});

test('renders exactly the sections this build has switched on', async ({ page }) => {
  await page.goto('/');
  for (const id of HOME_SECTION_IDS) {
    // logos and quote also need approved content, which does not exist yet.
    const shouldRender = expected[id] && id !== 'logos' && id !== 'quote';
    await expect(page.locator(`[data-home-section="${id}"]`), id).toHaveCount(shouldRender ? 1 : 0);
  }
});

test('ships none of the retired copy', async ({ page }) => {
  await page.goto('/');
  const text = await page.locator('main').innerText();
  for (const stale of ['Possibilities', 'Efficiency Gains', 'Grower Community', 'Join thousands']) {
    expect(text, stale).not.toContain(stale);
  }
  expect(text).not.toMatch(new RegExp(String.fromCharCode(0x2014)));
});

test('the hero links down to how it works', async ({ page }) => {
  test.skip(!expected['how-it-works'], 'how-it-works is off in this build');
  await page.goto('/');
  await expect(page.locator('.hero__secondary')).toHaveAttribute('href', '#how-it-works');
  await expect(page.locator('#how-it-works')).toHaveCount(1);
});

test('how it works swaps the sticky screenshot as each step scrolls past', async ({ page }) => {
  test.skip(!expected['how-it-works'], 'how-it-works is off in this build');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  const frames = page.locator('.story__frame');
  await expect(frames).toHaveCount(STORY_STEPS.length);
  await expect(frames.nth(0)).toHaveAttribute('data-active', '');

  // Every step in turn, then back up: the frame follows whichever step is centred,
  // including a middle step reached by scrolling up from below.
  const order = [...STORY_STEPS.keys(), ...[...STORY_STEPS.keys()].reverse()];
  for (const index of order) {
    await page.locator(`.story__step[data-step="${index}"]`).evaluate((el) =>
      el.scrollIntoView({ block: 'center', behavior: 'instant' }),
    );
    await expect(frames.nth(index), `step ${index}`).toHaveAttribute('data-active', '');
    await expect(page.locator('.story__frame[data-active]')).toHaveCount(1);
  }
});

test('how it works stacks with inline screenshots on a phone', async ({ page }) => {
  test.skip(!expected['how-it-works'], 'how-it-works is off in this build');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.story__stage')).toBeHidden();
  await expect(page.locator('.story__inline-shot').first()).toBeVisible();
});

test('the page never scrolls sideways on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('the module rail moves one card per arrow press', async ({ page }) => {
  test.skip(!expected.modules, 'modules is off in this build');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');

  const rail = page.locator('.modules__rail');
  const prev = page.getByRole('button', { name: 'Previous module' });
  const next = page.getByRole('button', { name: 'Next module' });

  await expect(next).toBeVisible();
  await expect(prev).toHaveAttribute('aria-disabled', 'true');

  await next.click();
  await expect.poll(() => rail.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await expect(prev).toHaveAttribute('aria-disabled', 'false');
});

test('FAQ answers open from the keyboard and match the structured data', async ({ page }) => {
  test.skip(!expected.faq, 'faq is off in this build');
  await page.goto('/');

  const first = page.locator('.faq__item').first();
  await first.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(first).toHaveAttribute('open', '');
  await expect(first.locator('.faq__answer')).toHaveText(FAQ_ITEMS[0].answer);

  const ld = await page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((nodes) => nodes.map((n) => JSON.parse(n.textContent ?? '{}')));
  const faq = ld.find((entry) => entry['@type'] === 'FAQPage');
  expect(faq?.mainEntity.map((q: { name: string }) => q.name)).toEqual(
    FAQ_ITEMS.map((item) => item.question),
  );
});
