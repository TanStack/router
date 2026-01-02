---
id: seo
title: SEO
---

> [!NOTE]
> Looking to optimize for AI assistants and LLMs? See the [LLM Optimization (LLMO) guide](./llmo).

## What is SEO, really?

SEO (Search Engine Optimization) is often misunderstood as simply "showing up on Google" or a checkbox that a library can magically provide. In reality, SEO is a broad discipline focused on delivering valuable content that people need and making it easy for them to find.

**Technical SEO** is a subset of SEO that developers interact with most directly. It involves using tools and APIs that satisfy the technical requirements of search engines, crawlers, rankers, and even LLMs. When someone says a framework has "good SEO support," they typically mean it provides the tools to make this process straightforward.

TanStack Start provides comprehensive technical SEO capabilities, but you still need to put in the work to use them effectively.

## What TanStack Start Provides

TanStack Start gives you the building blocks for technical SEO:

- **Server-Side Rendering (SSR)** - Ensures crawlers receive fully rendered HTML
- **Static Prerendering** - Pre-generates pages for optimal performance and crawlability
- **Document Head Management** - Full control over meta tags, titles, and structured data
- **Performance** - Fast load times through code-splitting, streaming, and optimal bundling
- **[@tanstack/meta](#using-tanstackmeta)** - Composable, type-safe utilities for meta tags and JSON-LD

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

## Using @tanstack/meta

For a more streamlined approach to meta tag management, you can use the `@tanstack/meta` package. It provides composable, type-safe utilities that handle the 90% use case with a single function call.

### Installation

```bash
npm install @tanstack/meta
```

### The createMeta Function

The `createMeta` function generates a complete set of meta tags from a simple configuration:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { createMeta } from '@tanstack/meta'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: createMeta({
      title: 'My App - Home',
      description: 'Welcome to My App, a platform for...',
    }),
  }),
  component: HomePage,
})
```

This single call generates:

- `<meta charset="utf-8">`
- `<meta name="viewport" content="width=device-width, initial-scale=1">`
- `<title>My App - Home</title>`
- `<meta name="description" content="...">`
- Open Graph tags (`og:title`, `og:description`, `og:type`)
- Twitter Card tags (`twitter:card`, `twitter:title`, `twitter:description`)

### Full Example with Social Sharing

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { createMeta } from '@tanstack/meta'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    const post = await fetchPost(params.postId)
    return { post }
  },
  head: ({ loaderData }) => ({
    meta: createMeta({
      title: loaderData.post.title,
      description: loaderData.post.excerpt,
      url: `https://myapp.com/posts/${loaderData.post.id}`,
      image: loaderData.post.coverImage,
      type: 'article',
      siteName: 'My App',
      twitterSite: '@myapp',
    }),
  }),
  component: PostPage,
})
```

### Extending with Custom Meta

You can extend the generated meta with custom tags:

```tsx
import { createMeta } from '@tanstack/meta'

head: () => ({
  meta: createMeta({
    title: 'My Page',
    description: 'Page description',
    extend: [
      { name: 'author', content: 'John Doe' },
      { name: 'keywords', content: 'react, tanstack, router' },
    ],
  }),
})
```

### Using Individual Builders

For more control, use the individual builder functions through the `meta` namespace:

```tsx
import { meta } from '@tanstack/meta'

head: () => ({
  meta: [
    ...meta.title('My Page', '%s | My App'), // With template
    ...meta.description('Page description'),
    ...meta.robots({ index: true, follow: true }),
    ...meta.openGraph({
      title: 'My Page',
      type: 'website',
      image: 'https://myapp.com/og.jpg',
    }),
    ...meta.twitter({
      card: 'summary_large_image',
      site: '@myapp',
    }),
  ],
})
```

### Available Builders

| Builder | Description |
|---------|-------------|
| `meta.title(value, template?)` | Page title with optional template |
| `meta.description(content)` | Meta description |
| `meta.charset()` | UTF-8 charset |
| `meta.viewport(content?)` | Viewport configuration |
| `meta.robots(config)` | Robot directives (index, follow, etc.) |
| `meta.canonical(href)` | Canonical URL link |
| `meta.alternate(links)` | Alternate language links |
| `meta.openGraph(config)` | Open Graph meta tags |
| `meta.twitter(config)` | Twitter Card meta tags |
| `meta.themeColor(color)` | Theme color (supports light/dark) |
| `meta.verification(config)` | Search engine verification codes |

## Structured Data (JSON-LD)

Structured data helps search engines understand your content and can enable rich results in search.

### Manual Approach

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

### Using @tanstack/meta/json-ld

The `@tanstack/meta/json-ld` subpath provides type-safe builders for common Schema.org types:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { createMeta } from '@tanstack/meta'
import { jsonLd } from '@tanstack/meta/json-ld'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    const post = await fetchPost(params.postId)
    return { post }
  },
  head: ({ loaderData }) => ({
    meta: [
      ...createMeta({
        title: loaderData.post.title,
        description: loaderData.post.excerpt,
        url: `https://myapp.com/posts/${loaderData.post.id}`,
        image: loaderData.post.coverImage,
        type: 'article',
      }),
      ...jsonLd.article({
        headline: loaderData.post.title,
        description: loaderData.post.excerpt,
        author: loaderData.post.author.name,
        datePublished: loaderData.post.publishedAt,
        image: loaderData.post.coverImage,
      }),
    ],
  }),
  component: PostPage,
})
```

### Available JSON-LD Builders

| Builder | Description |
|---------|-------------|
| `jsonLd.website(config)` | WebSite schema with optional search action |
| `jsonLd.organization(config)` | Organization with logo, socials, address |
| `jsonLd.person(config)` | Person schema |
| `jsonLd.article(config)` | Article, BlogPosting, NewsArticle |
| `jsonLd.product(config)` | Product with price, availability, ratings |
| `jsonLd.breadcrumbs(items)` | BreadcrumbList for navigation |
| `jsonLd.faq(items)` | FAQPage with questions and answers |
| `jsonLd.event(config)` | Event with location, dates |
| `jsonLd.localBusiness(config)` | LocalBusiness, Restaurant, Store |
| `jsonLd.softwareApp(config)` | SoftwareApplication |
| `jsonLd.video(config)` | VideoObject |
| `jsonLd.recipe(config)` | Recipe with ingredients, instructions |
| `jsonLd.course(config)` | Course with provider |
| `jsonLd.howTo(config)` | HowTo with steps |
| `jsonLd.create(schema)` | Raw JSON-LD for any schema type |

### Product Page Example

```tsx
import { createMeta } from '@tanstack/meta'
import { jsonLd } from '@tanstack/meta/json-ld'

export const Route = createFileRoute('/products/$productId')({
  loader: async ({ params }) => {
    const product = await fetchProduct(params.productId)
    return { product }
  },
  head: ({ loaderData }) => ({
    meta: [
      ...createMeta({
        title: loaderData.product.name,
        description: loaderData.product.description,
        url: `https://myapp.com/products/${loaderData.product.id}`,
        image: loaderData.product.image,
        type: 'product',
      }),
      ...jsonLd.product({
        name: loaderData.product.name,
        description: loaderData.product.description,
        image: loaderData.product.image,
        price: loaderData.product.price,
        currency: 'USD',
        availability: 'InStock',
        brand: loaderData.product.brand,
        rating: {
          value: loaderData.product.rating,
          count: loaderData.product.reviewCount,
        },
      }),
      ...jsonLd.breadcrumbs([
        { name: 'Home', url: 'https://myapp.com' },
        { name: 'Products', url: 'https://myapp.com/products' },
        { name: loaderData.product.name, url: `https://myapp.com/products/${loaderData.product.id}` },
      ]),
    ],
  }),
  component: ProductPage,
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

```ts
// vite.config.ts
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

Prerendered pages load faster and are easily crawlable. See the [Static Prerendering guide](./static-prerendering) for configuration options.

## Sitemaps

### Built-in Sitemap Generation

TanStack Start can automatically generate a sitemap when you enable prerendering with link crawling:

```ts
// vite.config.ts
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

For sites with dynamic content that can't be discovered at build time, you can create a dynamic sitemap using a [server route](./server-routes). Consider caching this at your CDN for performance:

```ts
// src/routes/sitemap[.]xml.ts
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        const posts = await fetchAllPosts()

        const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://myapp.com/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  ${posts
    .map(
      (post) => `
  <url>
    <loc>https://myapp.com/posts/${post.id}</loc>
    <lastmod>${post.updatedAt}</lastmod>
    <changefreq>weekly</changefreq>
  </url>`,
    )
    .join('')}
</urlset>`

        return new Response(sitemap, {
          headers: {
            'Content-Type': 'application/xml',
          },
        })
      },
    },
  },
})
```

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

For more complex scenarios (e.g., different rules per environment), you can create a robots.txt file using a [server route](./server-routes):

```ts
// src/routes/robots[.]txt.ts
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: async () => {
        const robots = `User-agent: *
Allow: /

Sitemap: https://myapp.com/sitemap.xml`

        return new Response(robots, {
          headers: {
            'Content-Type': 'text/plain',
          },
        })
      },
    },
  },
})
```

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
