---
id: seo
title: SEO
description: Configure SEO in TanStack Start with page metadata, canonical URLs, structured data, server rendering, sitemaps, and robots.txt.
---

> [!NOTE]
> Looking to optimize for AI assistants and LLMs? See the [Generative Engine Optimization (GEO) guide](./geo).

## What is SEO, really?

SEO (Search Engine Optimization) is often misunderstood as simply "showing up on Google" or a checkbox that a library can magically provide. In reality, SEO is a broad discipline focused on delivering valuable content that people need and making it easy for them to find.

**Technical SEO** is a subset of SEO that developers interact with most directly. It involves using tools and APIs that satisfy the technical requirements of search engines, crawlers, rankers, and even LLMs. When someone says a framework has "good SEO support," they typically mean it provides the tools to make this process straightforward.

TanStack Start provides comprehensive technical SEO capabilities, but you still need to put in the work to use them effectively.

## What TanStack Start Provides

TanStack Start gives you the building blocks for technical SEO:

- **Server-Side Rendering (SSR)** - Ensures crawlers receive fully rendered HTML
- **Static Prerendering** - Pre-generates pages for optimal performance and crawlability
- **Document Head Management** - Full control over meta tags, titles, and structured data
- **Performance** - Fast load times through code-splitting, streaming, and optimized builds

## Document Head Management

The `head` property on routes is your primary tool for SEO. It allows you to set page titles, meta descriptions, Open Graph tags, and more.

### Basic Meta Tags

```tsx
// src/routes/index.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'My App - Home' },
      {
        name: 'description',
        content: 'Welcome to My App, a platform for...',
      },
    ],
  }),
  component: HomePage,
})
```

### Dynamic Meta Tags

Use loader data to generate dynamic meta tags for content pages:

```tsx
// src/routes/posts/$postId.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    const post = await fetchPost(params.postId)
    return { post }
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData.post.title },
      { name: 'description', content: loaderData.post.excerpt },
    ],
  }),
  component: PostPage,
})
```

### Open Graph and Social Sharing

Open Graph tags control how your pages appear when shared on social media:

```tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    const post = await fetchPost(params.postId)
    return { post }
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData.post.title },
      { name: 'description', content: loaderData.post.excerpt },
      // Open Graph
      { property: 'og:title', content: loaderData.post.title },
      { property: 'og:description', content: loaderData.post.excerpt },
      { property: 'og:image', content: loaderData.post.coverImage },
      { property: 'og:type', content: 'article' },
      // Twitter Card
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: loaderData.post.title },
      { name: 'twitter:description', content: loaderData.post.excerpt },
      { name: 'twitter:image', content: loaderData.post.coverImage },
    ],
  }),
  component: PostPage,
})
```

### Canonical URLs

Canonical URLs help prevent duplicate content issues:

```tsx
export const Route = createFileRoute('/posts/$postId')({
  head: ({ params }) => ({
    links: [
      {
        rel: 'canonical',
        href: `https://myapp.com/posts/${params.postId}`,
      },
    ],
  }),
  component: PostPage,
})
```

## Structured Data (JSON-LD)

Structured data helps search engines understand your content and can enable rich results in search:

```tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    const post = await fetchPost(params.postId)
    return { post }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData.post.title }],
    scripts: [
      {
        type: 'application/ld+json',
        children: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: loaderData.post.title,
          description: loaderData.post.excerpt,
          image: loaderData.post.coverImage,
          author: {
            '@type': 'Person',
            name: loaderData.post.author.name,
          },
          datePublished: loaderData.post.publishedAt,
        }),
      },
    ],
  }),
  component: PostPage,
})
```

## Server-Side Rendering

SSR is enabled by default in TanStack Start. This ensures that search engine crawlers receive fully rendered HTML content, which is critical for SEO.

```tsx
// SSR is automatic - your pages are rendered on the server
export const Route = createFileRoute('/about')({
  component: AboutPage,
})
```

For routes that don't need SSR, you can disable it selectively. However, be aware this may impact SEO for those pages:

```tsx
// Only disable SSR for pages that don't need SEO
export const Route = createFileRoute('/dashboard')({
  ssr: false, // Dashboard doesn't need to be indexed
  component: DashboardPage,
})
```

See the [Selective SSR guide](./selective-ssr) for more details.

## Static Prerendering

For content that doesn't change frequently, static prerendering generates HTML at build time for optimal performance:

<!-- ::start:tabs variant="bundler" -->

# Vite

```ts title="vite.config.ts"
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'

export default defineConfig({
  plugins: [
    tanstackStart({
      prerender: {
        enabled: true,
        crawlLinks: true,
      },
    }),
  ],
})
```

# Rsbuild

```ts title="rsbuild.config.ts"
import { defineConfig } from '@rsbuild/core'
import { tanstackStart } from '@tanstack/react-start/plugin/rsbuild'

export default defineConfig({
  plugins: [
    tanstackStart({
      prerender: {
        enabled: true,
        crawlLinks: true,
      },
    }),
  ],
})
```

<!-- ::end:tabs -->

Prerendered pages load faster and are easily crawlable. See the [Static Prerendering guide](./static-prerendering) for configuration options.

## Sitemaps

### Built-in Sitemap Generation

TanStack Start can automatically generate a sitemap when you enable prerendering with link crawling:

<!-- ::start:tabs variant="bundler" -->

# Vite

```ts title="vite.config.ts"
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'

export default defineConfig({
  plugins: [
    tanstackStart({
      prerender: {
        enabled: true,
        crawlLinks: true, // Discovers all linkable pages
      },
      sitemap: {
        enabled: true,
        host: 'https://myapp.com',
      },
    }),
  ],
})
```

# Rsbuild

```ts title="rsbuild.config.ts"
import { defineConfig } from '@rsbuild/core'
import { tanstackStart } from '@tanstack/react-start/plugin/rsbuild'

export default defineConfig({
  plugins: [
    tanstackStart({
      prerender: {
        enabled: true,
        crawlLinks: true, // Discovers all linkable pages
      },
      sitemap: {
        enabled: true,
        host: 'https://myapp.com',
      },
    }),
  ],
})
```

<!-- ::end:tabs -->

The sitemap is generated at build time by crawling all discoverable pages from your routes. This is the recommended approach for static or mostly-static sites.

### Static Sitemap

For simple sites, you can also place a static `sitemap.xml` file in your `public` directory:

```xml
<!-- public/sitemap.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://myapp.com/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://myapp.com/about</loc>
    <changefreq>monthly</changefreq>
  </url>
</urlset>
```

This approach works well when your site structure is known and doesn't change often.

### Dynamic Sitemap

For content that can't be discovered at build time (blog posts from a CMS, products from a database, user profiles), serve the sitemap from a [server route](./server-routes) with `createSitemapHandler`. Return an array of entries and TanStack Start renders valid, escaped sitemap XML with the right `Content-Type`:

```ts
// src/routes/sitemap[.]xml.ts
import { createFileRoute } from '@tanstack/react-router'
import { createSitemapHandler } from '@tanstack/react-start/server'

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: createSitemapHandler(async () => {
        const posts = await fetchAllPosts()

        return [
          { url: '/', changeFrequency: 'daily', priority: 1 },
          ...posts.map((post) => ({
            url: `/posts/${post.slug}`,
            lastModified: post.updatedAt,
            changeFrequency: 'weekly' as const,
          })),
        ]
      }),
    },
  },
})
```

Relative URLs such as `/posts/hello` are resolved against the origin of the incoming request. If your app runs behind a proxy and sees an internal host, set `baseUrl` explicitly. You can also pass response headers, which is a good place to let your CDN cache the sitemap:

```ts
GET: createSitemapHandler(generateEntries, {
  baseUrl: 'https://myapp.com',
  headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' },
}),
```

Each entry supports `url`, `lastModified`, `changeFrequency`, `priority`, localized `alternates.languages`, `images` and `videos`. The shape matches Next.js' `MetadataRoute.Sitemap`, so an existing `sitemap.ts` generator can usually be reused as-is.

The generator receives the server route context (`request`, `params`, `context`), so it can use request data or values from [middleware](./middleware).

### Large Sitemaps

A single sitemap file may contain at most 50,000 URLs. For larger sites, split the URLs across several sitemaps with a [prefix/suffix path param](/router/latest/docs/framework/react/guide/path-params) and list them in a sitemap index:

```ts
// src/routes/sitemap[.]xml.ts
import { createFileRoute } from '@tanstack/react-router'
import { createSitemapIndexHandler } from '@tanstack/react-start/server'

const PAGE_SIZE = 50_000

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: createSitemapIndexHandler(async () => {
        const total = await countProducts()
        const pages = Math.ceil(total / PAGE_SIZE)

        return Array.from({ length: pages }, (_, id) => ({
          url: `/sitemap-${id}.xml`,
        }))
      }),
    },
  },
})
```

```ts
// src/routes/sitemap-{$id}[.]xml.ts
import { createFileRoute } from '@tanstack/react-router'
import { createSitemapHandler } from '@tanstack/react-start/server'

export const Route = createFileRoute('/sitemap-{$id}.xml')({
  server: {
    handlers: {
      GET: createSitemapHandler(async ({ params }) => {
        const products = await getProducts({
          offset: Number(params.id) * PAGE_SIZE,
          limit: PAGE_SIZE,
        })

        return products.map((product) => ({
          url: `/products/${product.slug}`,
          lastModified: product.updatedAt,
        }))
      }),
    },
  },
})
```

If you need the XML string itself, for example to write it to storage, use `renderSitemap(entries, { baseUrl })` and `renderSitemapIndex(entries, { baseUrl })`.

## robots.txt

### Static robots.txt

The simplest approach is to place a static `robots.txt` file in your `public` directory:

```txt
// public/robots.txt
User-agent: *
Allow: /

Sitemap: https://myapp.com/sitemap.xml
```

This file will be served automatically at `/robots.txt`. This is the most common approach for most sites.

### Dynamic robots.txt

For rules that depend on the environment or the request, use `createRobotsHandler`:

```ts
// src/routes/robots[.]txt.ts
import { createFileRoute } from '@tanstack/react-router'
import { createRobotsHandler } from '@tanstack/react-start/server'

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: createRobotsHandler(() => {
        if (process.env.DEPLOY_ENV !== 'production') {
          return { rules: { userAgent: '*', disallow: '/' } }
        }

        return {
          rules: [
            { userAgent: '*', allow: '/', disallow: ['/admin', '/api'] },
            { userAgent: 'GPTBot', disallow: '/' },
          ],
          sitemap: '/sitemap.xml',
        }
      }),
    },
  },
})
```

Relative `sitemap` URLs are resolved the same way as in `createSitemapHandler`. To get the text without a response, use `renderRobots(robots, { baseUrl })`.

## Best Practices

### Performance Matters

Page speed is a ranking factor. TanStack Start helps with:

- **Automatic code-splitting** - Only load the JavaScript needed for each page
- **Streaming SSR** - Start sending HTML to the browser immediately
- **Preloading** - Prefetch routes before users navigate to them

### Content is King

Technical SEO is just one piece of the puzzle. The most important factors are:

- **Quality content** - Create content that provides value to users
- **Clear site structure** - Organize your routes logically
- **Descriptive URLs** - Use meaningful path segments (`/posts/my-great-article` vs `/posts/123`)
- **Internal linking** - Help users and crawlers discover your content

### Test Your Implementation

Use these tools to verify your SEO implementation:

- [Google Search Console](https://search.google.com/search-console) - Monitor indexing and search performance
- [Google Rich Results Test](https://search.google.com/test/rich-results) - Validate structured data
- [Open Graph Debugger](https://developers.facebook.com/tools/debug/) - Preview social sharing cards
- Browser DevTools - Inspect rendered HTML and meta tags

### Track Your Rankings

To monitor your SEO performance over time, we recommend [Nozzle.io](https://nozzle.io?utm_source=tanstack). Nozzle provides enterprise-grade rank tracking that lets you monitor unlimited keywords, track SERP features, and analyze your visibility against competitors. Unlike traditional rank trackers, Nozzle stores the entire SERP for every query, giving you complete data to understand how your pages perform in search results.
