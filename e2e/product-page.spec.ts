import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { CDN_ORIGIN, MANIFEST_URL, PRODUCT_SECTIONS, shotUrl } from '../src/lib/media';

/**
 * #23: the /product page, and the promise that adding it did not cost the
 * home page its hero.
 *
 * ## The empty bucket is the fixture
 *
 * No screenshot has been published to `cdn.canopy.ag` yet, because no R2 API
 * credential exists. That makes AC-3 provable for real rather than simulated:
 * every CDN image on the page genuinely 404s today. The AC-3 tests below do
 * not depend on that state either way, though. They drive it deterministically
 * with request interception, so they keep their meaning after the bucket
 * fills and cannot quietly turn into a test of the network.
 *
 * AC-2's second half and AC-5 are the ones that need a real published asset.
 * They are skipped with a stated reason rather than asserted weakly.
 */

const CDN_GLOB = 'https://cdn.canopy.ag/**';

/** Is anything actually published? Never throws: no network is "not published". */
async function manifestIsPublished(request: APIRequestContext): Promise<boolean> {
  try {
    const response = await request.get(MANIFEST_URL, { timeout: 15_000 });
    return response.status() === 200;
  } catch {
    return false;
  }
}

/** Block every CDN image, the way an empty bucket or a dead CDN would. */
async function blockCdn(page: Page): Promise<void> {
  await page.route(CDN_GLOB, (route) => route.abort('failed'));
}

interface ClsReading {
  /** Every un-prompted layout shift on the page. */
  total: number;
  /** Only shifts with a source inside a `.shot`, which is what AC-3 is about. */
  shot: number;
}

/**
 * Collect layout shifts from before the first paint, split by whether a shot
 * caused them.
 *
 * The split matters. The page inherits a small webfont-swap reflow from the
 * site layout: Inter loads with `display=swap`, and the fallback's metrics
 * differ, so headings re-flow once. Measured on this page, every shift source
 * is a text node (`SPAN.gradient-text`, `DIV.feature__copy`) and none is inside
 * a `.shot`. The size of that reflow depends on which fallback face the host
 * has, which is why it is about 0.003 on macOS and about 0.031 on a Linux CI
 * runner.
 *
 * AC-3 is a claim about what an unavailable or slow CDN image does, so it is
 * asserted on `shot`, which must be zero. `total` is still bounded, at Google's
 * 0.1 "good" threshold, so a real regression cannot hide behind the split. It
 * is deliberately not tightened to the current value: that would make this
 * suite fail on an unrelated font or copy change.
 */
async function recordLayoutShifts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const store = window as unknown as { __cls: { total: number; shot: number } };
    store.__cls = { total: 0, shot: 0 };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
          sources?: { node?: Node | null }[];
        };
        if (shift.hadRecentInput) continue;
        store.__cls.total += shift.value;

        // Attribute the whole entry to shots if any source sits inside one.
        // Over-attributing is the safe direction for a test asserting that
        // shots shift nothing.
        const fromShot = (shift.sources ?? []).some((source) => {
          const node = source.node;
          if (!node) return false;
          const element = node.nodeType === 1 ? (node as Element) : node.parentElement;
          return !!element?.closest('.shot');
        });
        if (fromShot) store.__cls.shot += shift.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

async function readCls(page: Page): Promise<ClsReading> {
  return page.evaluate(
    () =>
      (window as unknown as { __cls?: ClsReading }).__cls ?? {
        total: 0,
        shot: 0,
      },
  );
}

test.describe('#23 AC-2: /product renders screenshots served from cdn.canopy.ag', () => {
  test('#23 AC-2 every screenshot on the page is sourced from the CDN', async ({ page }) => {
    await blockCdn(page);
    const response = await page.goto('/product');
    expect(response?.status(), 'route must exist').toBe(200);

    const images = page.locator('.shot__img');
    await expect(images).toHaveCount(PRODUCT_SECTIONS.length);

    for (const section of PRODUCT_SECTIONS) {
      const img = page.locator(`.shot[data-shot="${section.id}"] .shot__img`);
      await expect(img).toHaveAttribute('src', shotUrl(section.id, 'dark', 1));
      // Both captured scales, so a retina display is not served the 1x file.
      await expect(img).toHaveAttribute(
        'srcset',
        `${shotUrl(section.id, 'dark', 1)} 1x, ${shotUrl(section.id, 'dark', 2)} 2x`,
      );
      await expect(img).toHaveAttribute('alt', section.alt);
    }

    // Nothing may sneak in from anywhere else: the point of the epic is that
    // product imagery is CDN served with traceable provenance.
    const sources = await images.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLImageElement).getAttribute('src') ?? ''),
    );
    expect(sources.length).toBeGreaterThan(0);
    for (const src of sources) {
      expect(new URL(src).origin).toBe(CDN_ORIGIN);
    }
  });

  test('#23 AC-2 the CDN screenshots actually paint', async ({ page, request }) => {
    test.skip(
      !(await manifestIsPublished(request)),
      'unproven: cdn.canopy.ag bucket is empty. No R2 API credential exists, so ' +
        'media:publish in canopy-roost has never run and every asset 404s. ' +
        'Re-run this test once a capture has been published.',
    );

    await page.goto('/product');
    const first = page.locator('.shot').first();
    await expect(first).toHaveAttribute('data-state', 'loaded', { timeout: 20_000 });

    const painted = await first
      .locator('.shot__img')
      .evaluate((node) => (node as HTMLImageElement).naturalWidth);
    expect(painted, 'a painted image has a non-zero intrinsic width').toBeGreaterThan(0);
  });
});

test.describe('#23 AC-3: an unavailable or slow CDN image costs no layout and shows no broken icon', () => {
  test('#23 AC-3 frames reserve the capture aspect ratio before anything loads', async ({
    page,
  }) => {
    await blockCdn(page);
    await page.goto('/product');

    const frames = page.locator('.shot__frame');
    await expect(frames).toHaveCount(PRODUCT_SECTIONS.length);

    const boxes = await frames.evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
    );

    for (const box of boxes) {
      expect(box.width, 'frame has width').toBeGreaterThan(0);
      expect(box.height, 'frame reserves height with no image').toBeGreaterThan(0);
      // 1440 / 900 = 1.6, the capture viewport.
      expect(box.width / box.height).toBeCloseTo(1.6, 1);
    }
  });

  test('#23 AC-3 a failed image is removed, so no broken-image icon paints', async ({ page }) => {
    await blockCdn(page);
    await page.goto('/product');

    const first = page.locator('.shot').first();
    await expect(first).toHaveAttribute('data-state', 'failed');

    // display:none paints nothing at all, including the browser's broken-image
    // glyph. Asserting on computed style rather than a class keeps this true
    // however the rule is expressed.
    const display = await first
      .locator('.shot__img')
      .evaluate((node) => getComputedStyle(node).display);
    expect(display).toBe('none');

    // The frame it lived in is still there, still the right size.
    await expect(first.locator('.shot__placeholder')).toBeVisible();
    const height = await first
      .locator('.shot__frame')
      .evaluate((node) => node.getBoundingClientRect().height);
    expect(height).toBeGreaterThan(0);
  });

  test('#23 AC-3 every shot resolves, none is left pending', async ({ page }) => {
    await blockCdn(page);
    await page.goto('/product');
    // Lazy images below the fold need to be reached before they can fail.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

    for (const section of PRODUCT_SECTIONS) {
      await expect(page.locator(`.shot[data-shot="${section.id}"]`)).toHaveAttribute(
        'data-state',
        'failed',
      );
    }
  });

  test('#23 AC-3 an unavailable CDN produces no cumulative layout shift', async ({ page }) => {
    await recordLayoutShifts(page);
    await blockCdn(page);
    await page.goto('/product');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForLoadState('networkidle');

    const cls = await readCls(page);
    // The reserved boxes must contribute nothing at all.
    expect(cls.shot, `shot-attributable layout shift was ${cls.shot}`).toBe(0);
    // And the page as a whole must still be in Google's "good" band.
    expect(cls.total, `total layout shift was ${cls.total}`).toBeLessThan(0.1);
  });

  test('#23 AC-3 a slow CDN image does not move the page when it arrives', async ({ page }) => {
    // A 1x1 transparent PNG, served late. Stands in for a slow capture.
    const pixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    await page.route(CDN_GLOB, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.fulfill({ status: 200, contentType: 'image/png', body: pixel });
    });

    await recordLayoutShifts(page);
    await page.goto('/product');

    const caption = page.locator('.shot__caption').first();
    const before = await caption.evaluate((node) => node.getBoundingClientRect().top);

    await expect(page.locator('.shot').first()).toHaveAttribute('data-state', 'loaded', {
      timeout: 15_000,
    });

    const after = await caption.evaluate((node) => node.getBoundingClientRect().top);
    expect(after, 'content below the frame must not move when the image lands').toBeCloseTo(
      before,
      0,
    );
    const cls = await readCls(page);
    expect(cls.shot, `shot-attributable layout shift was ${cls.shot}`).toBe(0);
    expect(cls.total, `total layout shift was ${cls.total}`).toBeLessThan(0.1);
  });
});

test.describe('#23 AC-4: the existing video hero still works', () => {
  test('#23 AC-4 the hero video is present, sourced and error free', async ({ page }) => {
    const failures: string[] = [];
    page.on('response', (response) => {
      const url = response.url();
      if (/\/hero\//.test(url) && response.status() >= 400) {
        failures.push(`${response.status()} ${url}`);
      }
    });

    await page.goto('/');

    const video = page.locator('video.hero__video');
    await expect(video).toHaveCount(1);
    await expect(video).toHaveAttribute('poster', '/hero/canopy-hero-poster.jpg');

    // The <source> must point at a file the server actually has. A regressed
    // or renamed source is exactly what this catches.
    const sources = await video.locator('source').evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLSourceElement).getAttribute('src') ?? ''),
    );
    expect(sources, 'hero must declare at least one source').not.toHaveLength(0);
    expect(sources).toContain('/hero/canopy-hero-loop.mp4');

    // The browser has to accept the media, not merely be handed a URL.
    const state = await video.evaluate(
      (node) =>
        new Promise<{ readyState: number; error: number | null; width: number }>((resolve) => {
          const el = node as HTMLVideoElement;
          const report = () =>
            resolve({
              readyState: el.readyState,
              error: el.error ? el.error.code : null,
              width: el.videoWidth,
            });
          if (el.readyState >= 1 || el.error) return report();
          el.addEventListener('loadedmetadata', report, { once: true });
          el.addEventListener('error', report, { once: true });
          setTimeout(report, 15_000);
        }),
    );
    expect(state.error, 'the hero video must not raise a media error').toBeNull();
    expect(state.readyState, 'hero metadata must load').toBeGreaterThanOrEqual(1);
    expect(state.width, 'a decoded video reports its intrinsic width').toBeGreaterThan(0);

    expect(failures, `failed hero media requests: ${failures.join(', ')}`).toHaveLength(0);
  });

  test('#23 AC-4 both hero assets are served, not just referenced', async ({ request }) => {
    for (const asset of ['/hero/canopy-hero-loop.mp4', '/hero/canopy-hero-poster.jpg']) {
      const response = await request.get(asset);
      expect(response.status(), asset).toBe(200);
      const length = Number(response.headers()['content-length'] ?? 0);
      expect(length, `${asset} must not be empty`).toBeGreaterThan(1000);
    }
  });
});

test.describe('#23 AC-5: CDN media carries a long-lived Cache-Control', () => {
  test('#23 AC-5 a published asset is cached for a long time', async ({ request }) => {
    test.skip(
      !(await manifestIsPublished(request)),
      'unproven: cdn.canopy.ag bucket is empty, so no response exists to inspect. ' +
        'No R2 API credential exists yet, so media:publish has never run.',
    );

    const response = await request.get(shotUrl(PRODUCT_SECTIONS[0]!.id, 'dark', 1));
    expect(response.status()).toBe(200);

    const cacheControl = response.headers()['cache-control'] ?? '';
    const maxAge = /max-age=(\d+)/.exec(cacheControl);
    expect(maxAge, `no max-age in "${cacheControl}"`).not.toBeNull();
    // Assets are content addressed by capture, so a day is the floor.
    expect(Number(maxAge![1])).toBeGreaterThanOrEqual(86_400);
  });
});

test.describe('#23: the page is reachable and honours the site conventions', () => {
  test('/product is linked from the site navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav a[href="/product"]')).toHaveCount(1);
  });

  test('/product renders in the dark theme with no em dashes', async ({ page }) => {
    await blockCdn(page);
    await page.goto('/product');
    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(page.locator('h1')).toBeVisible();

    const text = await page.locator('main').innerText();
    expect(text).not.toMatch(new RegExp(String.fromCharCode(0x2014)));
  });
});
