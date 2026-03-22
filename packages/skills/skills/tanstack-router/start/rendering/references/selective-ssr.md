# Selective SSR

Control SSR behavior per route.

## Disable SSR for Route

```tsx
export const Route = createFileRoute('/dashboard')({
  ssr: false, // Client-side only
  component: Dashboard,
})
```

## Client-Only Components

```tsx
import { ClientOnly } from '@tanstack/start'

function MapPage() {
  return (
    <div>
      <h1>Location</h1>
      <ClientOnly fallback={<div>Loading map...</div>}>
        <InteractiveMap /> {/* Only renders on client */}
      </ClientOnly>
    </div>
  )
}
```

## Conditional SSR

```tsx
export const Route = createFileRoute('/preview')({
  // SSR only if not a preview request
  ssr: ({ request }) => {
    const url = new URL(request.url)
    return !url.searchParams.has('preview')
  },
})
```

## Hybrid Patterns

```
/              → Full SSR (SEO critical)
/blog/*        → Full SSR (SEO critical)
/app/dashboard → No SSR (authenticated, dynamic)
/app/settings  → No SSR (authenticated, dynamic)
/preview       → No SSR (real-time preview)
```

```tsx
// routes/_app.tsx - Disable SSR for app section
export const Route = createFileRoute('/_app')({
  ssr: false, // All children are client-only
  component: () => <Outlet />,
})
```

## SSR with Auth Check

```tsx
export const Route = createFileRoute('/dashboard')({
  ssr: true, // SSR for initial load
  beforeLoad: async ({ context }) => {
    // Still check auth during SSR
    if (!context.auth.user) {
      throw redirect({ to: '/login' })
    }
  },
})
```

## When to Disable SSR

**Disable SSR for:**

- Admin dashboards (no SEO needed)
- Authenticated-only pages
- Heavy client-side interactivity
- Real-time data (WebSocket-driven)
- Browser API-dependent features

**Keep SSR for:**

- Public pages (SEO)
- Landing pages
- Blog posts
- Documentation
- Product pages
