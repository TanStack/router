# Entry Points

Client and server entry point customization.

## Client Entry (app/client.tsx)

```tsx
import { StartClient } from '@tanstack/start'
import { createRouter } from './router'

const router = createRouter()

export default function Client() {
  return <StartClient router={router} />
}
```

### With Providers

```tsx
import { StartClient } from '@tanstack/start'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRouter } from './router'
import { queryClient } from './query-client'

const router = createRouter()

export default function Client() {
  return (
    <QueryClientProvider client={queryClient}>
      <StartClient router={router} />
    </QueryClientProvider>
  )
}
```

## Server Entry (app/ssr.tsx)

```tsx
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/start/server'
import { createRouter } from './router'

export default createStartHandler({
  createRouter,
})(defaultStreamHandler)
```

### Custom Handler

```tsx
import { createStartHandler } from '@tanstack/start/server'
import { createRouter } from './router'

export default createStartHandler({
  createRouter,
  getRouterManifest: () =>
    import('./routeTree.gen').then((m) => m.routerManifest),
})(async ({ request, router, responseHeaders }) => {
  // Custom SSR logic
  const html = await renderToString(router)

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html',
      ...Object.fromEntries(responseHeaders),
    },
  })
})
```

## Router Configuration (app/router.tsx)

```tsx
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function createRouter() {
  return createTanStackRouter({
    routeTree,
    defaultPreload: 'intent',
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
```
