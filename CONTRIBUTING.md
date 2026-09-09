# Writing for the Canopy blog

Posts are files in this repo. You write one, open a pull request, look at the preview, and merge. Vercel deploys `main` to canopy.ag within a couple of minutes.

## One-time setup

1. Install Node 22 and clone the repo.
2. Create a GitHub token with `read:packages` on the `canopy-ag` org (Settings, Developer settings, Personal access tokens, classic). The site depends on a private package.
3. In a terminal, in the repo folder:

   ```bash
   export NODE_AUTH_TOKEN=<your token>
   npm install
   npm run dev
   ```

4. Open http://localhost:4321/blog. Drafts show locally.

If `npm install` fails with a 403 that mentions "expected scopes", the token is
missing `read:packages`. A 401 means the token expired. Make a new one and run
the export again. If you use the GitHub CLI, `gh auth refresh -h github.com -s read:packages`
then `export NODE_AUTH_TOKEN="$(gh auth token)"` also works.

## Writing a post

1. Copy `src/content/blog/_template` to `src/content/blog/<slug>`. The folder name becomes the URL, so use lowercase words joined by dashes: `leaching-fraction-on-hot-days`.
2. Edit `index.mdx`. Fill in the frontmatter at the top:

   | Field | What it is |
   |---|---|
   | `title` | Sentence case. |
   | `description` | One or two sentences. Shows under the title, on the card, and in search results. |
   | `pubDate` | `YYYY-MM-DD`. Newest post is featured on the blog page. |
   | `author` | `caleb` or `ermias`. |
   | `tags` | From `irrigation`, `crop-health`, `labor`, `economics`, `inputs`, `product`. Add a new one if you need it. |
   | `heroImage` | `./cover.jpg`, a file next to `index.mdx`. Optional. Landscape works best. |
   | `heroAlt` | Required if there is a hero. Describe the picture in one sentence. |
   | `heroCaption` | Optional line under the hero. |
   | `draft` | `true` while writing. Drafts show on previews, never on canopy.ag. |

3. Write the body in Markdown. Headings inside a post start at `##`.
4. Put images and clips in the same folder as `index.mdx`.

## Pictures, video, and callouts

Plain image, no caption:

```md
![Overhead irrigation on a block of containers](./photo.jpg)
```

Image with a caption. Import it at the top of the body first:

```mdx
import photo from './photo.jpg';

<Figure src={photo} alt="Overhead irrigation on a block of containers" caption="What to notice." credit="Photo: Canopy" />
```

Add `size="wide"` for a landscape or chart that should break out of the text column.

YouTube. Use the id after `v=` in the URL. The video loads when clicked.

```mdx
<Video id="dQw4w9WgXcQ" title="Walking a zone with the controller" caption="Optional." />
```

Short looping clip instead of a GIF. Keep it under ten seconds and three megabytes, muted, MP4.

```mdx
import relay from './relay.mp4';

<Clip src={relay} alt="Zone 4 valve opening" caption="Eight seconds, loops." />
```

Callout box:

```mdx
<Callout label="How to measure it">
Set a saucer under three containers before a run. Divide drainage by the volume applied.
</Callout>
```

Pull quote:

```mdx
<PullQuote cite="Caleb Saunders">
The schedule is not wrong, exactly. It is disconnected from the plant.
</PullQuote>
```

## Publishing

1. Commit on a branch and open a pull request against `main`.
2. Wait for two things on the PR: the "Site CI" check turns green, and the Vercel bot posts a preview link.
3. Open the preview. Your draft is visible there. Read it on your phone too.
4. When it is ready, change `draft: true` to `draft: false`, push, and merge.

If Site CI fails, the log says why. Common causes: a missing `heroAlt`, an image path that does not match a file, an em dash.

## Style

- Sentence case titles and headings.
- No em dashes anywhere. Use a comma, colon, or period.
- No exclamation marks. No emoji.
- Every image gets alt text that says what is in it.
- Short paragraphs. One idea each.

## Changing code

This guide is for posts. For pages, components, styling, the demo form, CI, and
deployment, read the [README](README.md), in particular "Contributing code" and
"How the site works". Agents should also read [AGENTS.md](AGENTS.md). The same
style rules above apply to copy inside code.
