# SSR Basics (Router Only)

Server-side rendering with TanStack Router without TanStack Start.

## Overview

For full SSR support, use TanStack Start. This covers basic SSR for custom setups.

## Server Entry

```tsx
// server.tsx
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { renderToString } from 'react-dom/server'
import { router } from './router'

export async function render(url: string) {
  const memoryHistory = createMemoryHistory({
    initialEntries: [url],
  })

  // Create router instance for this request
  const serverRouter = createRouter({
    ...router.options,
    history: memoryHistory,
  })

  // Wait for loaders
  await serverRouter.load()

  const html = renderToString(<RouterProvider router={serverRouter} />)

  return { html }
}
```

## Client Hydration

```tsx
// client.tsx
import { hydrateRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'

// Hydrate with dehydrated state from server
router.hydrate()

hydrateRoot(
  document.getElementById('root')!,
  <RouterProvider router={router} />,
)
```

## Dehydration/Hydration

Pass server data to client:

```tsx
// Server
const dehydratedState = serverRouter.dehydrate()

const html = `
  <script>
    window.__ROUTER_STATE__ = ${JSON.stringify(dehydratedState)}
  </script>
`

// Client
const router = createRouter({
  routeTree,
  hydrate: () => window.__ROUTER_STATE__,
})
```

## When to Use TanStack Start Instead

Use Start for:

- Server functions
- Streaming SSR
- Static generation
- Full-stack features
- Production deployment

Use basic SSR for:

- Custom server setups
- Non-Node.js runtimes
- Existing SSR frameworks integration
