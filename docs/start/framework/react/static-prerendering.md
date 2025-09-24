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

        // Callback when page is successfully rendered
        onSuccess: ({ page }) => {
          console.log(`Rendered ${page.path}!`)
        },
      },
      // Optional configuration for specific pages (without this it will still automatically
      // prerender all routes)
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
