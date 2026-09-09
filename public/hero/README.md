# Hero loop: container nursery diorama

Generated 2026-09-04 via Higgsfield (keyframe: Nano Banana Pro 2k · video: Seedance 2.5, start = end frame · seam: 0.4 s crossfade). Prompt package + regen recipe: `canopy-design/prompts/hero-nursery-higgsfield.md`.

`canopy-hero-loop.mp4` and `canopy-hero-poster.jpg` are committed in this folder and served by the site; nothing needs downloading for a normal checkout. The table below records where each version came from, for re-edits or a regen:

| File | URL | Notes |
|---|---|---|
| `canopy-hero-loop.mp4` (**v3, current**) | https://d2ol7oe51mr4n9.cloudfront.net/user_3GCezMneHZNTVInH88hJayW11TO/2b65860d-3322-4187-b281-922070ab6329.mp4 | 1920×1080, 14.4 s, 2.8 MB, silent, seamless loop (0.6 s crossfade, first/last diff 1.35/255). v2 + workers walking routes (workers-first prompt, job `6d1c7826-35cd-42d8-ba00-863d6048b24c`). |
| `canopy-hero-poster.jpg` (v3) | https://d2ol7oe51mr4n9.cloudfront.net/user_3GCezMneHZNTVInH88hJayW11TO/802125f6-e08f-44a0-9ada-0b271c5dc656.jpg | 1920×1080 first frame, use as `poster` |
| v2 loop (drones/robots/trucks moving, workers mostly static) | https://d2ol7oe51mr4n9.cloudfront.net/user_3GCezMneHZNTVInH88hJayW11TO/3b64b7bd-5890-4846-8395-7ab70e3515d7.mp4 | 14.4 s, 2.5 MB |
| v1 loop (superseded) | https://d2ol7oe51mr4n9.cloudfront.net/user_3GCezMneHZNTVInH88hJayW11TO/715705b1-8409-4dc1-bd38-2830d605d1f3.mp4 | 9.6 s, calmer motion, approximate logo |

Keyframe v3 (exact logo composited via ImageMagick perspective warp; see `canopy-design/prompts/hero-nursery-higgsfield.md` § logo): media id `a53bb18a-a2ac-47c8-9d29-117a536d6f96`. Video job: `8bd35e51-e202-4edc-99c7-29a375035a30` (Seedance 2.5, 15 s, start = end = keyframe v3).

Optional webm (smaller, for Chrome/Firefox): `ffmpeg -i canopy-hero-loop.mp4 -c:v libvpx-vp9 -b:v 0 -crf 30 -an canopy-hero-loop.webm`

Source assets kept on Higgsfield (job ids) in case of re-edit:
- Keyframe still (2752×1536): `c52da778-9183-47ec-af18-86e70768cab2`
- Raw Seedance roll used: `07ea57e5-66d1-4813-a84e-4d550e0367ac` (alternates `c04eaf2f…`, `929351e8…`; both end with a truck on the driveway and are not loop-clean)

## Component (shipped)

`src/components/Hero.astro` is wired into `src/pages/index.astro` (replaces the old centered-logo hero). It reads `/hero/canopy-hero-loop.mp4` + `/hero/canopy-hero-poster.jpg` from this folder (both committed, v3). A webm source is only emitted when the `videoWebm` prop is passed; none is committed today. To swap the loop, replace the two files here and run `npm run dev`. `preview.html` in this folder is a standalone mirror that streams the video from the CDN for judging the layout without the dev server. Copy follows the approved operating-layer positioning; the component uses one primary CTA, and the secondary CTA links to the About page. Reduced-motion and Save-Data users get the poster only.

## Embed reference: what the component does

```html
<section class="hero">
  <video class="hero__video" autoplay muted loop playsinline preload="metadata"
         poster="/hero/canopy-hero-poster.jpg" aria-hidden="true">
    <source src="/hero/canopy-hero-loop.webm" type="video/webm">
    <source src="/hero/canopy-hero-loop.mp4" type="video/mp4">
  </video>
  <div class="hero__overlay"></div>
  <div class="hero__copy">
    <h1>…</h1>
    <p>…</p>
    <a class="btn" href="…">…</a>
  </div>
</section>
```

```css
.hero { position: relative; min-height: 80vh; background: var(--canopy-dark); overflow: hidden; }
.hero__video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 60% 50%; }
.hero__overlay { position: absolute; inset: 0;
  background: linear-gradient(90deg, var(--canopy-dark) 0 30%, color-mix(in srgb, var(--canopy-dark) 60%, transparent) 50%, transparent 70%); }
.hero__copy { position: relative; max-width: 36rem; padding: 6rem 4rem; }
@media (prefers-reduced-motion: reduce) { .hero__video { display: none; } .hero { background: var(--canopy-dark) url(/hero/canopy-hero-poster.jpg) right center / cover no-repeat; } }
```

The left ~30% of the frame is intentionally low-density so headline + CTA sit over it. Use brand tokens for colors (no raw hex in the site).
