import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end gate for the site, run against a real production build rather
 * than the dev server: `astro check && astro build` is what ships, and the dev
 * server differs from it in ways this suite cares about.
 *
 * `npm run test:e2e`. The build is the slow part, so `PLAYWRIGHT_SKIP_BUILD=1`
 * reuses an existing `dist/` while iterating.
 */
const PORT = 4321;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    // The site is dark only, and the capture pipeline ships the dark variant.
    colorScheme: 'dark',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: process.env.PLAYWRIGHT_SKIP_BUILD
      ? `node e2e/static-server.mjs dist/client`
      : `npm run build && node e2e/static-server.mjs dist/client`,
    url: `http://localhost:${PORT}/product`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
