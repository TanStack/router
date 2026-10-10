---
id: hydration-errors
title: Hydration Errors
---

### Why it happens

- **Mismatch**: Server HTML differs from client render during hydration
- **Common causes**: `Intl` (locale/time zone), `Date.now()`, random IDs, responsive-only logic, feature flags, user prefs

### A route works during navigation but fails on refresh

Check the server log for a serialization error before treating this as a markup mismatch. A loader runs in the browser during client navigation, but its SSR result must cross the server-to-browser boundary. Returning a plain function, including a method nested inside an object, can break that transfer.

Return the data the component needs instead:

```tsx
// Cannot be serialized for SSR
loader: () => ({ title: () => 'My page' })

// Return the computed value
loader: () => ({ title: 'My page' })
```

Keep formatting functions in component code or another imported module. Call server-side functions inside the loader and return their supported results. Do not return an ordinary function to make it callable remotely, use [Server Functions](./server-functions.md) for that.

`suppressHydrationWarning` only addresses markup differences, it cannot repair missing loader data. Test a direct request, hydration, and client navigation after fixing the return value. The [loader serialization example](https://github.com/TanStack/router/blob/main/e2e/react-start/basic/src/routes/loader-serialization.tsx) and its [browser tests](https://github.com/TanStack/router/blob/main/e2e/react-start/basic/tests/loader-serialization.spec.ts) cover all three.

### Strategy 1 — Make server and client match

- **Pick a deterministic locale/time zone on the server** and use the same on the client
- **Source of truth**: cookie (preferred) or `Accept-Language` header
- **Compute once on the server** and hydrate as initial state

```tsx
// src/start.ts
import { createStart, createMiddleware } from '@tanstack/react-start'
import {
  getRequestHeader,
  getCookie,
  setCookie,
} from '@tanstack/react-start/server'

const localeTzMiddleware = createMiddleware().server(async ({ next }) => {
  const header = getRequestHeader('accept-language')
  const headerLocale = header?.split(',')[0] || 'en-US'
  const cookieLocale = getCookie('locale')
  const cookieTz = getCookie('tz') // set by client later (see Strategy 2)

  const locale = cookieLocale || headerLocale
  const timeZone = cookieTz || 'UTC' // deterministic until client sends tz

  // Persist locale for subsequent requests (optional)
  setCookie('locale', locale, { path: '/', maxAge: 60 * 60 * 24 * 365 })

  return next({ context: { locale, timeZone } })
})

export const startInstance = createStart(() => ({
  requestMiddleware: [localeTzMiddleware],
}))
```

```tsx
// src/routes/index.tsx (example)
import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'

export const getServerNow = createServerFn().handler(async () => {
  const locale = getCookie('locale') || 'en-US'
  const timeZone = getCookie('tz') || 'UTC'
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date())
})

export const Route = createFileRoute('/')({
  loader: () => getServerNow(),
  component: () => {
    const serverNow = Route.useLoaderData() as string
    return <time dateTime={serverNow}>{serverNow}</time>
  },
})
```

### Strategy 2 — Let the client tell you its environment

- On first visit, set a cookie with the client time zone; SSR uses `UTC` until then
- Do this without risking mismatches

```tsx
import * as React from 'react'
import { ClientOnly } from '@tanstack/react-router'

function SetTimeZoneCookie() {
  React.useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    document.cookie = `tz=${tz}; path=/; max-age=31536000`
  }, [])
  return null
}

export function AppBoot() {
  return (
    <ClientOnly fallback={null}>
      <SetTimeZoneCookie />
    </ClientOnly>
  )
}
```

### Strategy 3 — Make it client-only

- Wrap unstable UI in `<ClientOnly>` to avoid SSR and mismatches

```tsx
import { ClientOnly } from '@tanstack/react-router'
;<ClientOnly fallback={<span>—</span>}>
  <RelativeTime ts={someTs} />
</ClientOnly>
```

### Strategy 4 — Disable or limit SSR for the route

- Use Selective SSR to avoid rendering the component on the server

```tsx
export const Route = createFileRoute('/unstable')({
  ssr: 'data-only', // or false
  component: () => <ExpensiveViz />,
})
```

### Strategy 5 — Last resort suppression

- For small, known-different nodes, you can use React’s `suppressHydrationWarning`

```tsx
<time suppressHydrationWarning>{new Date().toLocaleString()}</time>
```

### Checklist

- **Deterministic inputs**: locale, time zone, feature flags
- **Prefer cookies** for client context; fallback to `Accept-Language`
- **Use `<ClientOnly>`** for inherently dynamic UI
- **Use Selective SSR** when server HTML cannot be stable
- **Avoid blind suppression**; use `suppressHydrationWarning` sparingly

See also: [Execution Model](./execution-model.md), [Code Execution Patterns](./code-execution-patterns.md), [Selective SSR](./selective-ssr.md), [Server Functions](./server-functions.md)
