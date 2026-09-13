---
id: learn-start-seo
title: Learn Start, SEO for Published Notes
description: Render titles, descriptions, canonical URLs, and Open Graph tags in TanStack Start server HTML, and build a sitemap that excludes private drafts.
---

Add search metadata to published notes without exposing private drafts. The [working checkpoint](https://github.com/TanStack/router/tree/main/examples/react/start-learn/checkpoints/06-seo) is `checkpoints/06-seo`.

## Run this checkpoint

Keep the authentication database and secret from the previous chapter. Change `APP_ORIGIN` in `.env` to `http://localhost:3145`, then run:

```sh
pnpm db:generate:06
pnpm db:migrate:06
pnpm exec vite checkpoints/06-seo --port 3145
```

The schema is unchanged, so existing accounts and notes remain. If you started here with an empty account database, run `pnpm db:seed:06` to add the public samples.

## Build metadata from loader data

The public note server function still selects only published rows. It now returns a canonical URL alongside the note. The route's `head` function reads that loader data and produces:

- A title containing the note title and site name.
- A description from the first 160 characters of the note body after whitespace normalization.
- An absolute canonical URL.
- Open Graph title, description, URL, and type.

The description length is this example's editorial choice, not a search-engine requirement. A larger publishing system can give authors a separate description field. This checkpoint has no preview image, so it does not invent an Open Graph image URL.

`HeadContent` in the root document renders these tags into the server response. They are available before hydration. React escapes title and description text, including quotes and angle brackets; do not build raw HTML strings from note content.

## Choose the public origin explicitly

`src/server/site.server.ts` validates `APP_ORIGIN` as an HTTP or HTTPS origin without a trailing slash. Canonical URLs and the sitemap use that configured origin, rather than copying the incoming host header.

A published note opened with `?utm_source=newsletter` still points to the clean `/notes/your-slug` canonical URL. Google treats canonical annotations as signals when choosing between duplicate URLs, not as guaranteed indexing instructions. See [Google's canonical URL guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls).

The home page has its own canonical URL. Filtered search pages use `noindex` and omit a canonical annotation because their results can differ from the unfiltered home page. Note links are real anchors and remain usable without JavaScript.

## List only public URLs

`src/routes/sitemap[.]txt.ts` serves `/sitemap.txt`. The escaped dot in the filename keeps it a literal dot in the route URL. Its database query selects only published slugs, then writes one absolute URL per line, with the home page first. `/robots.txt` points to that sitemap.

Google supports plain-text sitemaps for page URLs. A single sitemap is limited to 50,000 URLs or 50 MB uncompressed, so split the output before a larger site reaches either limit. Listing a URL does not guarantee indexing. See [Google's sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

The sitemap excludes account pages, private drafts, and search parameters. It uses `no-store` so a response does not keep advertising a note after unpublication. The public detail query independently checks publication state and returns a real HTTP 404 for a draft, an unpublished note, or an unknown slug.

## Keep access control in the database query

Private draft pages and the dashboard retain their session and ownership checks, `noindex`, and `private, no-store` responses. Robots directives do not protect private content. The auth checks from the previous chapter still run for every protected data operation.

Unpublishing prevents subsequent public reads, but cannot retract copies that someone already downloaded or a search engine cached. Publish only content its owner intends to make public.

## Inspect the HTML without JavaScript

Open a published note, use **View Page Source**, and find its title, description, canonical link, and visible note body. Open `/sitemap.txt` and confirm the note is listed. Unpublish it from **My notes**, then verify that its public URL returns 404 and disappears from the sitemap.

Stop the development server and run:

```sh
COURSE_CHECKPOINT=06-seo pnpm test:e2e
```

The test disables JavaScript, creates one published note and one draft, checks metadata and real links, verifies sitemap exclusions, and checks unpublication. It also checks that the server HTML does not contain the configured database URL or auth secret.

Next: [Build and deploy the application](./deployment).
