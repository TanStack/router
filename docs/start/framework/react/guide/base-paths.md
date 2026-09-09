---
id: base-paths
title: Base Paths
---

# Base Paths

Use base paths when your application or its assets are served below the origin root. TanStack Start has two separate settings:

- Vite's `base` controls the public URL prefix for assets, such as JavaScript and CSS.
- Start's `router.basepath` controls the URL prefix for application routes and server functions.

Configure these settings in `vite.config.ts`. Do not rely on the router instance in `src/router.tsx` to configure a Start base path.

## Serve the Application and Assets from the Same Path

For example, to serve the application and its assets from `/app/`, set both options to the same path:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  base: '/app/',
  plugins: [
    tanstackStart({
      router: {
        basepath: '/app',
      },
    }),
    viteReact(),
  ],
})
```

This configuration produces URLs with the following responsibilities:

| URL                  | Prefix source                          |
| -------------------- | -------------------------------------- |
| `/app/about`         | `router.basepath`                      |
| `/app/_serverFn/...` | `router.basepath` and `serverFns.base` |
| `/app/assets/...`    | Vite `base`                            |

If you omit `router.basepath`, Start derives it from a path-based Vite `base`. Setting both explicitly can make the deployment contract easier to see.

Your development server handles this configuration automatically. In production, configure your server or reverse proxy to forward `/app/*` to the Start application and serve the client assets at the same prefix.

## Use Different Paths for Routes and Assets

You can keep application routes at the origin root while serving assets from another path. Set Vite's `base` to the asset prefix and set `router.basepath` explicitly to `/`:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  base: '/_ui/',
  plugins: [
    tanstackStart({
      router: {
        basepath: '/',
      },
    }),
    viteReact(),
  ],
})
```

This configuration produces application routes such as `/` and `/about`, while JavaScript and CSS URLs begin with `/_ui/`.

In production, make both URL spaces available:

- Forward application routes such as `/about` to the Start server.
- Serve or forward asset requests under `/_ui/`.

## Verify the Configuration

Check both direct requests and client-side navigation:

1. Open the application at its configured route base.
2. Navigate with a `Link` and confirm that the route URL contains `router.basepath`, not Vite's `base`.
3. Inspect script and stylesheet URLs and confirm that they contain Vite's `base`.
4. Load a nested route directly to verify that the production server forwards it correctly.

For runtime asset rewriting with a Content Delivery Network (CDN), see [CDN Asset URLs](./cdn-asset-urls).
