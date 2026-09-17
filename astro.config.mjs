import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';
import { remarkReadingTime } from './src/lib/blog/remark-reading-time.mjs';

export default defineConfig({
  output: 'static',
  adapter: vercel(),
  integrations: [react(), mdx()],
  image: {
    // Product screenshots are served from the Cloudflare R2 bucket behind
    // cdn.canopy.ag, not committed to this repo. Without an entry here
    // astro:assets treats the host as unauthorized and passes the URL through
    // unoptimized, silently. Measured, rather than assumed: an <Image> on a CDN
    // URL builds clean without this block and fails with "Failed to load remote
    // image ... received 404" with it, which is Astro accepting the host and
    // getting as far as fetching. Authorization is asserted directly against
    // Astro's own isRemoteAllowed in src/lib/media.test.ts.
    //
    // Note the consequence: astro:assets fetches remote images at build time,
    // so <Image> on a CDN URL breaks the build until assets are published.
    // ProductShot.astro uses a plain <img> for that reason.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.canopy.ag',
      },
    ],
  },
  markdown: {
    remarkPlugins: [remarkReadingTime],
  },
  vite: {
    plugins: [tailwindcss()],
  },
  site: 'https://canopy.ag',
});
