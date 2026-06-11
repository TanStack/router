# SPA Mode

Client-only rendering without SSR.

## Enable SPA Mode

```ts
// app.config.ts
export default defineConfig({
  server: {
    preset: 'static', // No server runtime
  },
})
```

## Per-Route Client Rendering

```tsx
export const Route = createFileRoute('/dashboard')({
  ssr: false, // Skip SSR for this route
  component: Dashboard,
})
```

## Client-Only Components

```tsx
import { ClientOnly } from '@tanstack/start'

function MapView() {
  return (
    <ClientOnly fallback={<div>Loading map...</div>}>
      <InteractiveMap /> {/* Only renders on client */}
    </ClientOnly>
  )
}
```

## Why Use SPA Mode?

- **Static hosting**: Deploy to CDN without server
- **Admin dashboards**: No SEO needed
- **Browser-only APIs**: WebGL, IndexedDB-heavy apps
- **Existing SPA migration**: Gradual migration from CRA/Vite

## SPA with API Backend

```tsx
// Still use server functions for API calls
const getData = createServerFn().handler(async () => {
  return db.items.findMany()
})

// Route is client-only, but calls server
export const Route = createFileRoute('/dashboard')({
  ssr: false,
  loader: async () => {
    const items = await getData()
    return { items }
  },
})
```

## Hybrid Approach

```
/              → SSR (SEO important)
/about         → Static (pre-rendered)
/blog/*        → SSR with streaming
/dashboard/*   → SPA (no SSR)
/admin/*       → SPA (no SSR)
```

Each route can have its own rendering strategy.
