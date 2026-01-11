---
id: static-prerendering
title: Static Prerendering
---

Static prerendering is the process of generating static HTML files for your application. This can be useful for either improving the performance of your application, as it allows you to serve pre-rendered HTML files to users without having to generate them on the fly or for deploying static sites to platforms that do not support server-side rendering.

## Prerendering

TanStack Start can prerender your application to static HTML files, which can then be served to users without having to generate them on the fly. To prerender your application, you can add the `prerender` option to your tanstackStart configuration in `vite.config.ts` file:

```ts
// vite.config.ts

import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    tanstackStart({
      prerender: {
        // Enable prerendering
        enabled: true,

        // Enable if you need pages to be at `/page/index.html` instead of `/page.html`
        autoSubfolderIndex: true,

        // If disabled, only the root path or the paths defined in the pages config will be prerendered
        autoStaticPathsDiscovery: true,

        // How many prerender jobs to run at once
        concurrency: 14,

        // Whether to extract links from the HTML and prerender them also
        crawlLinks: true,

        // Filter function takes the page object and returns whether it should prerender
        filter: ({ path }) => !path.startsWith('/do-not-render-me'),

        // Number of times to retry a failed prerender job
        retryCount: 2,

        // Delay between retries in milliseconds
        retryDelay: 1000,

        // Maximum number of redirects to follow during prerendering
        maxRedirects: 5,

        // Fail if an error occurs during prerendering
        failOnError: true,

        // Callback when page is successfully rendered
        onSuccess: ({ page }) => {
          console.log(`Rendered ${page.path}!`)
        },
      },
      // Optional configuration for specific pages
      // Note: When autoStaticPathsDiscovery is enabled (default), discovered static
      // routes will be merged with the pages specified below
      pages: [
        {
          path: '/my-page',
          prerender: { enabled: true, outputPath: '/my-page/index.html' },
        },
      ],
    }),
    viteReact(),
  ],
})
```

## Automatic Static Route Discovery

All static paths will be automatically discovered and seamlessly merged with the specified `pages` config

Routes are excluded from automatic discovery in the following cases:

- Routes with path parameters (e.g., `/users/$userId`) since they require specific parameter values
- Layout routes (prefixed with `_`) since they don't render standalone pages
- Routes without components (e.g., API routes)

Note: Dynamic routes can still be prerendered if they are linked from other pages when `crawlLinks` is enabled.

## Crawling Links

When `crawlLinks` is enabled (default: `true`), TanStack Start will extract links from prerendered pages and prerender those linked pages as well.

For example, if `/` contains a link to `/posts`, then `/posts` will also be automatically prerendered.

## Sitemap Generation

TanStack Start can automatically generate a `sitemap.xml` file from your prerendered pages. To enable sitemap generation, add the `sitemap` option:

```ts
tanstackStart({
  prerender: {
    enabled: true,
  },
  sitemap: {
    host: 'https://example.com', // Required: Your site's base URL
  },
})
```

### Excluding Pages from Sitemap

You can exclude specific pages from the sitemap using the `pages` config:

```ts
tanstackStart({
  prerender: { enabled: true },
  sitemap: { host: 'https://example.com' },
  pages: [
    {
      path: '/admin',
      sitemap: { exclude: true },
    },
    {
      path: '/blog',
      sitemap: {
        priority: 0.8,
        changefreq: 'daily',
        lastmod: '2025-01-01',
      },
    },
  ],
})
```

### Available Sitemap Options

- `host` - **Required.** The base URL of your site
- `enabled` - Enable/disable sitemap generation (default: `true`)
- `outputPath` - Output filename (default: `sitemap.xml`)

### Per-Page Sitemap Options

- `exclude` - Exclude the page from sitemap
- `priority` - Priority from 0.0 to 1.0
- `changefreq` - Frequency of changes to the page, one of `never`, `always`, `hourly`, `daily`, `weekly`, `monthly`, `yearly`
- `lastmod` - Last modification date
- `alternateRefs` - Array of alternate language URLs
- `images` - Array of images
- `news` - News sitemap extension
