---
id: static-prerendering
title: Static Prerendering
---

Static prerendering is the process of generating static HTML files for your application. This can be useful for either improving the performance of your application, as it allows you to serve pre-rendered HTML files to users without having to generate them on the fly or for deploying static sites to platforms that do not support server-side rendering.

## Enabling Prerendering

Set the `prerender.enabled` to `true`, others fields are optional

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

        // If disabled only root or the paths defined in pages config will be pre-rerendered
        autoStaticPathsDiscovery: false,

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
        maxRedirect: 5,

        // Fail if an error occurs during prerendering
        failOnError: true

        // Callback when page is successfully rendered
        onSuccess: ({ page }) => {
          console.log(`Rendered ${page.path}!`)
        },
      },
      // Optional configuration for specific pages
      // Note: When pages are not specified, TanStack Start will automatically
      // discover and prerender all static routes in your application
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

All static paths will be prerendered, and seamlessly merge them with specified `pages` config

Routes with path parameters (e.g., `/users/$userId`) are excluded from automatic discovery since they require specific parameter values to be prerendered.

## Crawling Links

Prerender the pages link the prerendered pages

if `/` --has link to--> `/posts`, `/posts` will also be prerendered
