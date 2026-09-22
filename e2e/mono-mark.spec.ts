import { expect, test } from '@playwright/test';
import { activeLogos } from '../src/lib/brand';

/**
 * roadmap#149: the monochrome Canopy mark.
 *
 * ## Why these run end to end rather than as unit tests
 *
 * The story called AC-2 and AC-4 unit tests, written before it was noticed
 * that this repo has a Playwright suite. Both are claims about a rendered page
 * and a stylesheet: that both marks ship in the DOM, and that CSS alone picks
 * between them. A unit test could only grep the source for a selector, which
 * would pass on a rule the browser never applies. These drive the real built
 * site instead. The asset level half of AC-2 stays in src/lib/brand.test.ts.
 *
 * ## The default is today's behaviour
 *
 * canopy.ag does not set `data-theme` yet, roadmap#148 adds it. So the default
 * case below is a regression test on the colour mark still being what ships,
 * and the themed cases prove the switch works the moment #148 lands.
 */

const NAV_MARK = 'nav .brand-mark';

test.describe('roadmap#149 AC-2 both marks ship and CSS picks one', () => {
  test('both marks are in the DOM', async ({ page }) => {
    await page.goto('/');
    const mark = page.locator(NAV_MARK).first();
    await expect(mark.locator('.brand-mark-colour')).toHaveCount(1);
    await expect(mark.locator('.brand-mark-mono')).toHaveCount(1);
  });

  test('with no data-theme the colour mark shows, as it does today', async ({ page }) => {
    await page.goto('/');
    const mark = page.locator(NAV_MARK).first();
    await expect(mark.locator('.brand-mark-colour')).toBeVisible();
    await expect(mark.locator('.brand-mark-mono')).toBeHidden();
  });

  for (const theme of ['night', 'light'] as const) {
    test(`under data-theme="${theme}" the mono mark shows instead`, async ({ page }) => {
      await page.goto('/');
      await page.evaluate((t) => {
        document.documentElement.setAttribute('data-theme', t);
      }, theme);

      const mark = page.locator(NAV_MARK).first();
      await expect(mark.locator('.brand-mark-mono')).toBeVisible();
      await expect(mark.locator('.brand-mark-colour')).toBeHidden();
    });
  }

  test('under data-theme="dark" the colour mark is kept', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    const mark = page.locator(NAV_MARK).first();
    await expect(mark.locator('.brand-mark-colour')).toBeVisible();
    await expect(mark.locator('.brand-mark-mono')).toBeHidden();
  });

  /**
   * AC-3's mechanism, as far as it can be asserted without eyeballing: the
   * mono mark is painted from a mask that is already resolved before any theme
   * switch, so flipping the attribute cannot trigger a fetch or a repaint from
   * a new source. A swap implemented by changing an `img` `src` would.
   */
  test('the mono mark is painted by CSS, not fetched on switch', async ({ page }) => {
    await page.goto('/');
    const mono = page.locator(`${NAV_MARK} .brand-mark-mono`).first();

    const maskImage = await mono.evaluate(
      (el) =>
        getComputedStyle(el).maskImage ||
        getComputedStyle(el).webkitMaskImage,
    );
    expect(maskImage).toContain(activeLogos.mono.badge);

    await expect(mono).toHaveJSProperty('tagName', 'SPAN');
  });
});

/**
 * The favicon is FIXED and keeps brand colour, in every theme.
 *
 * roadmap#149 originally shipped a grey favicon everywhere, reasoning that
 * browser chrome cannot follow `data-theme` so one neutral mark was safer than
 * a JS swap path. That was reversed: the tab icon is the most-seen instance of
 * the mark, and trading its brand colour to serve a theme the chrome cannot
 * even observe was a bad trade. The mono asset stays in the brand map for the
 * in-page marks, which DO follow the theme.
 */
test.describe('roadmap#149 AC-4 the favicon is fixed, and keeps brand colour', () => {
  test('the icon link points at the colour favicon', async ({ page }) => {
    await page.goto('/');
    const href = await page
      .locator('link[rel="icon"]')
      .first()
      .getAttribute('href');
    expect(href).toBe(activeLogos.favicon);
  });

  for (const theme of ['night', 'light', 'dark'] as const) {
    test(`stays the colour favicon under data-theme="${theme}"`, async ({ page }) => {
      await page.goto('/');
      await page.evaluate((t) => {
        document.documentElement.setAttribute('data-theme', t);
      }, theme);

      const href = await page
        .locator('link[rel="icon"]')
        .first()
        .getAttribute('href');
      expect(href).toBe(activeLogos.favicon);
    });
  }

  test('the colour favicon is served and carries the brand palette', async ({ request }) => {
    const res = await request.get(activeLogos.favicon);
    expect(res.status()).toBe(200);

    const svg = (await res.text()).toLowerCase();
    expect(svg).toContain('#00d4ff');
    expect(svg).toContain('#4ade80');
  });
});
