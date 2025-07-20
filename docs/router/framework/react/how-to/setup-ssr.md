# How to Set Up Server-Side Rendering (SSR)

> [!IMPORTANT] > **[TanStack Start](../guide/tanstack-start.md) is the recommended way to set up SSR** - it provides SSR, streaming, and deployment with zero configuration.
>
> Use the manual setup below only if you need to integrate with an existing server.

## Quick Start with TanStack Start

```bash
npx create-tsrouter-app@latest my-app --template file-router
cd my-app
npm run dev
```

## Install dependencies

To server render the content, we will require a web server instance. In this guide we will be using express as our server, let us install these dependencies so long.

```bash
npm i express compression
npm i --save-dev @types/express
```

## Manual SSR Setup

### 1. Create Shared Router Configuration

```tsx
// src/router.tsx
import { createRouter as createTanstackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function createRouter() {
  return createTanstackRouter({
    routeTree,
    context: {
      head: '', // For server-side head injection
    },
    defaultPreload: 'intent',
    scrollRestoration: true,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
```

```tsx
// src/routerContext.tsx
export type RouterContext = {
  head: string
}
```

### 2. Set Up Server Entry Point

When a new request is received, the server entry point will be responsible for rendering the content on the first render.

```tsx
// src/entry-server.tsx
import { pipeline } from 'node:stream/promises'
import {
  RouterServer,
  createRequestHandler,
  renderRouterToString,
} from '@tanstack/react-router/ssr/server'
import { createRouter } from './router'
import type express from 'express'

export async function render({
  req,
  res,
  head = '',
}: {
  head?: string
  req: express.Request
  res: express.Response
}) {
  // Convert Express request to Web API Request
  const url = new URL(req.originalUrl || req.url, 'https://localhost:3000').href

  const request = new Request(url, {
    method: req.method,
    headers: (() => {
      const headers = new Headers()
      for (const [key, value] of Object.entries(req.headers)) {
        headers.set(key, value as any)
      }
      return headers
    })(),
  })

  // Create request handler
  const handler = createRequestHandler({
    request,
    createRouter: () => {
      const router = createRouter()

      // Inject server context (like head tags from Vite)
      router.update({
        context: {
          ...router.options.context,
          head: head,
        },
      })
      return router
    },
  })

  // Render to string (non-streaming)
  const response = await handler(({ responseHeaders, router }) =>
    renderRouterToString({
      responseHeaders,
      router,
      children: <RouterServer router={router} />,
    }),
  )

  // Convert Web API Response back to Express response
  res.statusMessage = response.statusText
  res.status(response.status)

  response.headers.forEach((value, name) => {
    res.setHeader(name, value)
  })

  // Stream response body
  return pipeline(response.body as any, res)
}
```

### 3. Set Up Client Entry Point

After the initial server rendering has completed, subsequent renders will be done on the client using the client entry point.

```tsx
// src/entry-client.tsx
import { hydrateRoot } from 'react-dom/client'
import { RouterClient } from '@tanstack/react-router/ssr/client'
import { createRouter } from './router'

const router = createRouter()

hydrateRoot(document, <RouterClient router={router} />)
```

### 4. Configure Vite for SSR

When setting up server rendering, we need to ensure that vite builds both a client side and server side bundle.
Our server and client bundles will be saved to and served from dist/server and dist/client respectively.

```ts
// vite.config.ts
import path from 'node:path'
import url from 'node:url'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { BuildEnvironmentOptions } from 'vite'

const __filename = url.fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// SSR configuration
const ssrBuildConfig: BuildEnvironmentOptions = {
  ssr: true,
  outDir: 'dist/server',
  ssrEmitAssets: true,
  copyPublicDir: false,
  emptyOutDir: true,
  rollupOptions: {
    input: path.resolve(__dirname, 'src/entry-server.tsx'),
    output: {
      entryFileNames: '[name].js',
      chunkFileNames: 'assets/[name]-[hash].js',
      assetFileNames: 'assets/[name]-[hash][extname]',
    },
  },
}

// Client-specific configuration
const clientBuildConfig: BuildEnvironmentOptions = {
  outDir: 'dist/client',
  emitAssets: true,
  copyPublicDir: true,
  emptyOutDir: true,
  rollupOptions: {
    input: path.resolve(__dirname, 'src/entry-client.tsx'),
    output: {
      entryFileNames: '[name].js',
      chunkFileNames: 'assets/[name]-[hash].js',
      assetFileNames: 'assets/[name]-[hash][extname]',
    },
  },
}

// https://vitejs.dev/config/
export default defineConfig((configEnv) => {
  return {
    plugins: [
      tanstackRouter({ target: 'react', autoCodeSplitting: true }),
      react(),
    ],
    build: configEnv.isSsrBuild ? ssrBuildConfig : clientBuildConfig,
  }
})
```

### 5. Update our project files

Since the HTML will be rendered on the server before being sent to the client, we can use the root route to provide all our HTML needs that we would usually include in our index.html.

```tsx
//src/routes/__root.tsx
import type { RouterContext } from '@/routerContext'
import {
  HeadContent,
  Outlet,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import appCss from '../App.css?url'

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    links: [
      { rel: 'icon', href: '/favicon.ico' },
      { rel: 'apple-touch-icon', href: '/logo192.png' },
      { rel: 'manifest', href: '/manifest.json' },
      { rel: 'stylesheet', href: appCss },
    ],
    meta: [
      {
        name: 'theme-color',
        content: '#000000',
      },
      {
        title: 'TanStack Router SSR File Based',
      },
      {
        charSet: 'UTF-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1.0',
      },
    ],
    scripts: [
      ...(!import.meta.env.PROD
        ? [
            {
              type: 'module',
              children: `import RefreshRuntime from "/@react-refresh"
  							RefreshRuntime.injectIntoGlobalHook(window)
  							window.$RefreshReg$ = () => {}
 							window.$RefreshSig$ = () => (type) => type
  							window.__vite_plugin_react_preamble_installed__ = true`,
            },
            {
              type: 'module',
              src: '/@vite/client',
            },
          ]
        : []),
      {
        type: 'module',
        src: import.meta.env.PROD
          ? '/entry-client.js'
          : '/src/entry-client.tsx',
      },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <TanStackRouterDevtools />
      </body>
    </html>
  )
}
```

Now we can remove safely index.html and main.tsx

### 6. Create Express Server

```js
// server.js
import path from 'node:path'
import express from 'express'
import * as zlib from 'node:zlib'

const isTest = process.env.NODE_ENV === 'test' || !!process.env.VITE_TEST_BUILD

export async function createServer(
  root = process.cwd(),
  isProd = process.env.NODE_ENV === 'production',
  hmrPort = process.env.VITE_DEV_SERVER_PORT,
) {
  const app = express()

  /**
   * @type {import('vite').ViteDevServer}
   */
  let vite
  if (!isProd) {
    vite = await (
      await import('vite')
    ).createServer({
      root,
      logLevel: isTest ? 'error' : 'info',
      server: {
        middlewareMode: true,
        watch: {
          // During tests we edit the files too fast and sometimes chokidar
          // misses change events, so enforce polling for consistency
          usePolling: true,
          interval: 100,
        },
        hmr: {
          port: hmrPort,
        },
      },
      appType: 'custom',
    })
    // use vite's connect instance as middleware
    app.use(vite.middlewares)
  } else {
    app.use(
      (await import('compression')).default({
        brotli: {
          flush: zlib.constants.BROTLI_OPERATION_FLUSH,
        },
        flush: zlib.constants.Z_SYNC_FLUSH,
      }),
    )
  }

  if (isProd) app.use(express.static('./dist/client'))

  app.use('/{*splat}', async (req, res) => {
    try {
      const url = req.originalUrl

      if (path.extname(url) !== '') {
        console.warn(`${url} is not valid router path`)
        res.status(404)
        res.end(`${url} is not valid router path`)
        return
      }

      // Best effort extraction of the head from vite's index transformation hook
      let viteHead = !isProd
        ? await vite.transformIndexHtml(
            url,
            `<html><head></head><body></body></html>`,
          )
        : ''

      viteHead = viteHead.substring(
        viteHead.indexOf('<head>') + 6,
        viteHead.indexOf('</head>'),
      )

      const entry = await (async () => {
        if (!isProd) {
          return vite.ssrLoadModule('/src/entry-server.tsx')
        } else {
          return import('./dist/server/entry-server.js')
        }
      })()

      console.info('Rendering: ', url, '...')
      entry.render({ req, res, head: viteHead })
    } catch (e) {
      !isProd && vite.ssrFixStacktrace(e)
      console.info(e.stack)
      res.status(500).end(e.stack)
    }
  })

  return { app, vite }
}

if (!isTest) {
  createServer().then(async ({ app }) =>
    app.listen(3000, () => {
      console.info('Client Server: http://localhost:3000')
    }),
  )
}
```

### 7. Update Package Scripts

The below update ensures that:

1. During development our express server will serve the app using the vite dev server using vite middleware mode.
2. Separate build processes are used for client and server bundles.
3. In production, it will be served over the express server directly.

```json
{
  "scripts": {
    "dev": "node server.js",
    "build": "npm run build:client && npm run build:server",
    "build:client": "vite build",
    "build:server": "vite build --ssr",
    "start": "NODE_ENV=production node server"
  }
}
```

## Streaming SSR

To enable streaming rendering for better performance, replace `renderRouterToString` with `renderRouterToStream`:

```tsx
// src/entry-server.tsx
import { renderRouterToStream } from '@tanstack/react-router/ssr/server'

const response = await handler(({ request, responseHeaders, router }) =>
  renderRouterToStream({
    request,
    responseHeaders,
    router,
    children: <RouterServer router={router} />,
  }),
)
```

## Common Problems

> [!TIP] > **Most of these problems are automatically solved by [TanStack Start](../guide/tanstack-start.md).** The issues below are primarily relevant for manual SSR setups.

### React Import Errors

**Problem:** `ReferenceError: React is not defined` during SSR

**Solution:** Ensure React is properly imported in components:

```tsx
// In your route components
import React from 'react' // Add explicit import
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: () => <div>Hello</div>, // React is now available
})
```

### Hydration Mismatches

**Problem:** Client HTML doesn't match server HTML

**Solution:** Ensure consistent rendering between server and client:

```tsx
// Use useIsomorphicLayoutEffect for browser-only effects
import { useLayoutEffect, useEffect } from 'react'

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect

function MyComponent() {
  useIsomorphicLayoutEffect(() => {
    // Browser-only code
  }, [])
}
```

### Bun Runtime Issues

**Problem:** `Cannot find module "react-dom/server"` with Bun

**Solution:** Add Node.js compatibility or use Bun-specific builds:

```json
{
  "scripts": {
    "build:bun": "bun build --target=bun --outdir=dist/bun src/entry-server.tsx"
  }
}
```

### Module Resolution Errors

**Problem:** SSR modules not resolving correctly

**Solution:** Configure Vite SSR externals:

```ts
// vite.config.ts
export default defineConfig({
  ssr: {
    noExternal: [
      // Add packages that need to be bundled
    ],
    external: [
      // Add packages that should remain external
    ],
  },
})
```

### Build Output Issues

**Problem:** Server build missing dependencies

**Solution:** Ensure correct Rollup input configuration for either client/server assets:

```ts
// vite.config.ts

// SSR configuration
const ssrBuildConfig: BuildEnvironmentOptions = {
  // server specific config is here
  rollupOptions: {
    input: path.resolve(__dirname, 'src/entry-server.tsx'),
    output: {
      entryFileNames: '[name].js',
      chunkFileNames: 'assets/[name]-[hash].js',
      assetFileNames: 'assets/[name]-[hash][extname]',
    },
  },
}

// Client-specific configuration
const clientBuildConfig: BuildEnvironmentOptions = {
  // client specific config is here
  rollupOptions: {
    input: path.resolve(__dirname, 'src/entry-client.tsx'),
    output: {
      entryFileNames: '[name].js',
      chunkFileNames: 'assets/[name]-[hash].js',
      assetFileNames: 'assets/[name]-[hash][extname]',
    },
  },
}

export default defineConfig((configEnv) => {
  return {
    // global config
    build: configEnv.isSsrBuild ? ssrBuildConfig : clientBuildConfig,
  }
})
```

## Related Resources

- [TanStack Start](../guide/tanstack-start.md) - **Recommended full-stack React framework with SSR**
- [SSR Guide (Detailed)](../guide/ssr.md) - Comprehensive SSR concepts
- [Data Loading](../guide/data-loading.md) - SSR-compatible data patterns

<!-- Common Next Steps (commented out until guides exist)
## Common Next Steps

- [Deploy to Production](./deploy-to-production.md) - Deploy your SSR app
- [Setup Authentication](./setup-authentication.md) - Add auth to SSR routes
- [Fix Build Issues](./fix-build-issues.md) - Troubleshoot bundler problems
-->
