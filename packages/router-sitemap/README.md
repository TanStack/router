# TanStack Router Sitemap Generator

Create an XML sitemap for your TanStack Router/Start based website.

This package provides a `generateSitemap` function and a `sitemapPlugin` vite plugin.

- Use the `sitemapPlugin` if you want to generate a static XML file during your Vite build.
- Use the `generateSitemap` function to generate a sitemap at request time in a Server Function/API Route using TanStack Start.

See the [configuration section](#sitemap-configuration) for more details on how to declare your sitemap.

## Installation

```bash
npm install @tanstack/router-sitemap
```

## Vite Plugin

The `examples/react/basic` example includes a sitemap generated using the Vite plugin.

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { sitemapPlugin } from '@tanstack/router-sitemap/vite-plugin'

export default defineConfig({
  plugins: [
    sitemapPlugin({
      sitemap: {
        siteUrl: 'https://tanstack.com',
        routes: ['/', '/posts'],
      },
    }),
  ],
})
```

### Plugin Configuration

| Property  | Type            | Default         | Description                                   |
| --------- | --------------- | --------------- | --------------------------------------------- |
| `sitemap` | `SitemapConfig` | Required        | Sitemap configuration object                  |
| `path`    | `string`        | `'sitemap.xml'` | Output file path relative to public directory |

## Start API Route

The `examples/react/start-basic` example includes a `sitemap.xml` API route.

```ts
// routes/sitemap[.]xml.ts
import { createServerFileRoute } from '@tanstack/react-start/server'
import { generateSitemap } from '@tanstack/router-sitemap'
import { fetchPosts } from '~/utils/posts'

export const ServerRoute = createServerFileRoute('/sitemap.xml').methods({
  GET: async () => {
    const sitemap = await generateSitemap({
      siteUrl: 'https://tanstack.com',
      routes: [
        '/',
        [
          '/posts/$postId',
          async () => {
            const posts = await fetchPosts()
            return posts.map((post) => ({
              path: `/posts/${post.id}`,
              priority: 0.8,
              changefreq: 'daily',
            }))
          },
        ],
      ],
    })

    return new Response(sitemap, {
      headers: {
        'Content-Type': 'application/xml',
      },
    })
  },
})
```

## Sitemap Configuration

### Configuration Options

| Property     | Type               | Required | Description                                              |
| ------------ | ------------------ | -------- | -------------------------------------------------------- |
| `siteUrl`    | `string`           | Yes      | Base URL of your website (e.g., `'https://example.com'`) |
| `routes`     | `Array<RouteItem>` | Yes      | Array of routes to include in the sitemap                |
| `priority`   | `number`           | No       | Default priority for all routes (0.0-1.0)                |
| `changefreq` | `ChangeFreq`       | No       | Default change frequency for all routes                  |

### Route Configuration

Route strings are inferred from your router similar to a `Link`'s `to` prop.

Routes can be configured as:

1. **Simple strings**: `'/'`, `'/about'`
2. **Configuration tuples**: `['/route-path', options]`

### Route Options

| Property     | Type                                                                              | Description                                           |
| ------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `path`       | `string`                                                                          | Custom path for dynamic routes                        |
| `lastmod`    | `string \| Date`                                                                  | Last modification date                                |
| `changefreq` | `'always' \| 'hourly' \| 'daily' \| 'weekly' \| 'monthly' \| 'yearly' \| 'never'` | How frequently the page changes                       |
| `priority`   | `number`                                                                          | Priority of this URL relative to other URLs (0.0-1.0) |

### Static Route Configuration

```ts
routes: [
  '/', // Simple string
  ['/about', { priority: 0.9, changefreq: 'monthly' }], // With options
  ['/dynamic', async () => ({ lastmod: await getLastModified() })], // Async function
]
```

### Dynamic Route Configuration

For routes with parameters, use functions that return arrays:

```ts
routes: [
  [
    '/posts/$postId',
    async () => {
      const posts = await fetchPosts()
      return posts.map((post) => ({
        path: `/posts/${post.id}`,
        lastmod: post.updatedAt,
        priority: 0.8,
        changefreq: 'daily',
      }))
    },
  ],
]
```

## Credit

This package is partly based on an existing plugin from the community: [tanstack-router-sitemap](https://github.com/Ryanjso/tanstack-router-sitemap).
