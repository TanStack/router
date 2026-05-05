---
id: static-prerendering
title: Static Prerendering
---

Static prerendering is the process of generating static HTML files for your application. This can be useful for either improving the performance of your application, as it allows you to serve pre-rendered HTML files to users without having to generate them on the fly or for deploying static sites to platforms that do not support server-side rendering.

## Prerendering

TanStack Start can prerender your application to static HTML files, which can then be served to users without having to generate them on the fly. To prerender your application, you can add the `prerender` option to your `tanstackStart` configuration:

<!-- ::start:tabs variant="bundler" -->

# Vite

```ts title="vite.config.ts"
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import viteSolid from 'vite-plugin-solid'

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

        // Maximum time in milliseconds to wait for each prerenderParams callback
        prerenderParamsTimeout: 30000,

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
    viteSolid({ ssr: true }),
  ],
})
```

# Rsbuild

```ts title="rsbuild.config.ts"
import { defineConfig } from '@rsbuild/core'
import { pluginBabel } from '@rsbuild/plugin-babel'
import { pluginSolid } from '@rsbuild/plugin-solid'
import { tanstackStart } from '@tanstack/solid-start/plugin/rsbuild'

export default defineConfig({
  plugins: [
    pluginBabel({
      include: /\.(?:jsx|tsx)$/,
    }),
    pluginSolid(),
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
  ],
})
```

<!-- ::end:tabs -->

## Automatic Static Route Discovery

All static paths will be automatically discovered and seamlessly merged with the specified `pages` config

Routes are excluded from automatic discovery in the following cases:

- Routes with path parameters (e.g., `/users/$userId`) since they require specific parameter values
- Layout routes (prefixed with `_`) since they don't render standalone pages
- Routes without components (e.g., API routes)

Note: Dynamic routes can still be prerendered if they are linked from other pages when `crawlLinks` is enabled.

## Dynamic Route Prerendering

Dynamic routes can declare `prerenderParams` to generate specific parameter values at build time. Each returned entry creates one page from the route path and can override sitemap or prerender options for that page.

```tsx
// src/routes/posts/$postId.tsx
import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/posts/$postId')({
  validateSearch: (search: Record<string, unknown>): { ref?: string } => ({
    ...(typeof search.ref === 'string' ? { ref: search.ref } : {}),
  }),
  sitemap: {
    changefreq: 'weekly',
  },
  prerenderParams: async () => {
    const posts = await fetchPosts()

    return posts.map((post) => ({
      params: { postId: post.id },
      search: { ref: 'sitemap' },
      sitemap: {
        lastmod: post.updatedAt,
        priority: 0.8,
      },
    }))
  },
  component: PostComponent,
})

function PostComponent() {
  const params = Route.useParams()

  return <div>Post {params().postId}</div>
}
```

`prerenderParams` receives `{ routePath, signal }`. The signal aborts when the build process is interrupted and when `prerender.prerenderParamsTimeout` elapses. Each entry's `params` and optional `search` values are typed from the route and used to create the generated URL. Search params are preserved in generated page paths and sitemap URLs using the router's default search serialization; custom `stringifySearch` router options are not applied during this build-time expansion. The route-level `sitemap` option applies to every generated page, and `entry.sitemap` is merged on top for a specific parameter entry. Use `entry.sitemap.exclude` to generate the HTML page without adding it to the sitemap.

The `sitemap` route option only controls metadata for generated sitemap entries. It does not enable sitemap output by itself; sitemap XML is still controlled by the top-level `sitemap` configuration in your Start plugin config.

Code that is only referenced by `prerenderParams` or `sitemap` is removed from the client route bundle, so these options can import server-only data sources used to discover pages at build time.

## Crawling Links

When `crawlLinks` is enabled (default: `true`), TanStack Start will extract links from prerendered pages and prerender those linked pages as well.

For example, if `/` contains a link to `/posts`, then `/posts` will also be automatically prerendered.
