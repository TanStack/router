# How to Set Up Server-Side Rendering (SSR)

This guide shows you how to set up Server-Side Rendering (SSR) with TanStack Router. SSR improves initial page load performance by rendering HTML on the server before sending it to the client.

> [!IMPORTANT]
> **TanStack Start is the recommended way to use SSR with TanStack Router.** 
> 
> [TanStack Start](https://tanstack.com/start) is our official full-stack React framework that provides SSR out-of-the-box with zero configuration. It handles all the complexity shown in this guide automatically.
>
> **Use this manual setup guide only if:**
> - You need to integrate with an existing server setup
> - You're migrating from another SSR solution gradually
> - You have specific custom requirements that Start doesn't cover
> 
> **For new projects, start with [TanStack Start](https://tanstack.com/start) instead.**

## Quick Start

**Option 1: TanStack Start (Recommended)**

```bash
npx create-start@latest my-app
cd my-app
npm run dev
```

That's it! You get SSR, streaming, file-based routing, and much more with zero configuration.

**Option 2: Manual SSR Setup**

If you need manual SSR setup, it involves:

1. **Creating shared router configuration** that works on both server and client
2. **Setting up a server entry point** to render your app server-side
3. **Setting up a client entry point** to hydrate the server-rendered HTML
4. **Configuring your bundler** (Vite, Webpack, etc.) for SSR builds

## Step-by-Step Setup

### 1. Create Shared Router Configuration

Create a router factory that can be used by both server and client:

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

### 2. Set Up Server Entry Point

Create a server entry that renders your app to HTML:

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

Create a client entry that hydrates the server-rendered HTML:

```tsx
// src/entry-client.tsx
import { hydrateRoot } from 'react-dom/client'
import { RouterClient } from '@tanstack/react-router/ssr/client'
import { createRouter } from './router'

const router = createRouter()

hydrateRoot(document, <RouterClient router={router} />)
```

### 4. Configure Vite for SSR

Update your Vite configuration:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    react(),
    TanStackRouterVite(),
  ],
  build: {
    rollupOptions: {
      input: {
        main: './index.html',
        server: './src/entry-server.tsx',
      },
    },
  },
  ssr: {
    noExternal: ['@tanstack/react-router'],
  },
})
```

### 5. Create Express Server

Set up an Express server to handle SSR:

```js
// server.js
import path from 'node:path'
import express from 'express'
import * as zlib from 'node:zlib'

const isProduction = process.env.NODE_ENV === 'production'

export async function createServer() {
  const app = express()

  let vite
  if (!isProduction) {
    // Development: Use Vite dev server
    vite = await (await import('vite')).createServer({
      server: { middlewareMode: true },
      appType: 'custom',
    })
    app.use(vite.middlewares)
  } else {
    // Production: Serve static files and use compression
    app.use(
      (await import('compression')).default({
        brotli: { flush: zlib.constants.BROTLI_OPERATION_FLUSH },
        flush: zlib.constants.Z_SYNC_FLUSH,
      }),
    )
    app.use(express.static('./dist/client'))
  }

  app.use('*', async (req, res) => {
    try {
      const url = req.originalUrl

      // Skip non-route requests
      if (path.extname(url) !== '') {
        console.warn(`${url} is not valid router path`)
        res.status(404).end(`${url} is not valid router path`)
        return
      }

      // Extract head tags from Vite's transformation
      let viteHead = ''
      if (!isProduction) {
        const transformed = await vite.transformIndexHtml(
          url,
          `<html><head></head><body></body></html>`,
        )
        viteHead = transformed.substring(
          transformed.indexOf('<head>') + 6,
          transformed.indexOf('</head>'),
        )
      }

      // Load entry module
      const entry = !isProduction
        ? await vite.ssrLoadModule('/src/entry-server.tsx')
        : await import('./dist/server/entry-server.js')

      console.info('Rendering:', url)
      await entry.render({ req, res, head: viteHead })
    } catch (e) {
      !isProduction && vite.ssrFixStacktrace(e)
      console.error(e.stack)
      res.status(500).end(e.stack)
    }
  })

  return { app, vite }
}

// Start server
if (process.env.NODE_ENV !== 'test') {
  createServer().then(({ app }) => {
    app.listen(3000, () => {
      console.info('Server running at http://localhost:3000')
    })
  })
}
```

### 6. Update Package Scripts

Add SSR build scripts to your `package.json`:

```json
{
  "scripts": {
    "dev": "node server.js",
    "build": "npm run build:client && npm run build:server",
    "build:client": "vite build --outDir dist/client",
    "build:server": "vite build --ssr src/entry-server.tsx --outDir dist/server",
    "start": "NODE_ENV=production node server.js"
  }
}
```

## Why TanStack Start Instead?

Before diving into more advanced configurations, consider that **TanStack Start** gives you all of this and more with zero configuration:

- ✅ **Automatic SSR & Streaming** - Works out of the box
- ✅ **File-based routing** - No manual route tree configuration
- ✅ **Built-in deployment** - Deploy to Vercel, Netlify, Cloudflare, etc.
- ✅ **API routes** - Full-stack development
- ✅ **TypeScript** - Fully typed by default
- ✅ **Optimized builds** - Production-ready bundling
- ✅ **Development experience** - Hot reload, error boundaries, dev tools

**Quick Start with TanStack Start:**

```bash
# Create a new Start project
npx create-start@latest my-start-app
cd my-start-app

# Already includes SSR, routing, and everything you need
npm run dev
```

[Learn more about TanStack Start →](https://tanstack.com/start)

## Streaming SSR (Manual Setup)

For better performance with slower data fetching, enable streaming SSR:

```tsx
// src/entry-server.tsx - Replace renderRouterToString with:
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

## Different Deployment Targets

### Node.js Production

```bash
# Build for Node.js
npm run build
NODE_ENV=production node server.js
```

### Bun Runtime

Update your server to handle Bun-specific requirements:

```ts
// Add to entry-server.tsx top
import './fetch-polyfill' // If using custom fetch polyfill

// For Bun, ensure react-dom/server exports are available
if (typeof process !== 'undefined' && process.versions?.bun) {
  // Bun-specific setup if needed
}
```

### Edge Runtime

For edge deployments, use Web APIs instead of Node.js APIs:

```tsx
// src/entry-server-edge.tsx
import {
  createRequestHandler,
  renderRouterToString,
  RouterServer,
} from '@tanstack/react-router/ssr/server'
import { createRouter } from './router'

export async function handleRequest(request: Request): Promise<Response> {
  const handler = createRequestHandler({
    request,
    createRouter,
  })

  return handler(({ responseHeaders, router }) =>
    renderRouterToString({
      responseHeaders,
      router,
      children: <RouterServer router={router} />,
    }),
  )
}
```

## Common Problems

> [!TIP]
> **Most of these problems are automatically solved by [TanStack Start](https://tanstack.com/start).** The issues below are primarily relevant for manual SSR setups.

### React Import Errors

**Problem:** `ReferenceError: React is not defined` during SSR

**Solution:** Ensure React is properly imported in components:

```tsx
// In your route components
import React from 'react' // Add explicit import
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: () => <div>Hello</div> // React is now available
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
      '@tanstack/react-router',
      // Add other packages that need to be bundled
    ],
    external: [
      // Add packages that should remain external
    ],
  },
})
```

### Build Output Issues

**Problem:** Server build missing dependencies

**Solution:** Ensure correct Rollup input configuration:

```ts
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: './index.html',
        server: './src/entry-server.tsx',
      },
      output: {
        entryFileNames: (chunkInfo) => {
          return chunkInfo.name === 'server' 
            ? '[name].js' 
            : 'assets/[name]-[hash].js'
        },
      },
    },
  },
})
```

## Related Resources

- [TanStack Start](https://tanstack.com/start) - **Recommended full-stack React framework with SSR**
- [SSR Guide (Detailed)](../guide/ssr.md) - Comprehensive SSR concepts
- [Data Loading](../guide/data-loading.md) - SSR-compatible data patterns

<!-- Common Next Steps (commented out until guides exist)
## Common Next Steps

- [Deploy to Production](./deploy-to-production.md) - Deploy your SSR app
- [Setup Authentication](./setup-authentication.md) - Add auth to SSR routes
- [Fix Build Issues](./fix-build-issues.md) - Troubleshoot bundler problems
-->