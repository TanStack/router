---
id: execution-model
title: Execution Model
---

Understanding where code runs is fundamental to building TanStack Start applications. This guide explains TanStack Start's execution model and how to control where your code executes.

## Core Principle: Isomorphic by Default

**All code in TanStack Start is isomorphic by default** - it runs and is included in both server and client bundles unless explicitly constrained.

```tsx
// ✅ This runs on BOTH server and client
function formatPrice(price: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(price)
}

// ✅ Route loaders are ISOMORPHIC
export const Route = createFileRoute('/products')({
  loader: async () => {
    // This runs on server during SSR AND on client during navigation
    const response = await fetch('/api/products')
    return response.json()
  },
})
```

> **Critical Understanding**: Route `loader`s are isomorphic - they run on both server and client, not just the server.

## The Execution Boundary

TanStack Start applications run in two environments:

### Server Environment

- **Node.js runtime** with access to file system, databases, environment variables
- **During SSR** - Initial page renders on server
- **API requests** - Server functions execute server-side
- **Build time** - Static generation and pre-rendering

### Client Environment

- **Browser runtime** with access to DOM, localStorage, user interactions
- **After hydration** - Client takes over after initial server render
- **Navigation** - Route loaders run client-side during navigation
- **User interactions** - Event handlers, form submissions, etc.

## Execution Control APIs

### Server-Only Execution

| API                      | Use Case                  | Client Behavior           |
| ------------------------ | ------------------------- | ------------------------- |
| `createServerFn()`       | RPC calls, data mutations | Network request to server |
| `createServerOnlyFn(fn)` | Utility functions         | Throws error              |

```tsx
import { createServerFn, createServerOnlyFn } from '@tanstack/solid-start'

// RPC: Server execution, callable from client
const updateUser = createServerFn({ method: 'POST' })
  .validator((data: UserData) => data)
  .handler(async ({ data }) => {
    // Only runs on server, but client can call it
    return await db.users.update(data)
  })

// Utility: Server-only, client crashes if called
const getEnvVar = createServerOnlyFn(() => process.env.DATABASE_URL)
```

### Client-Only Execution

| API                      | Use Case                        | Server Behavior  |
| ------------------------ | ------------------------------- | ---------------- |
| `createClientOnlyFn(fn)` | Browser utilities               | Throws error     |
| `<ClientOnly>`           | Components needing browser APIs | Renders fallback |

```tsx
import { createClientOnlyFn } from '@tanstack/solid-start'
import { ClientOnly } from '@tanstack/solid-router'

// Utility: Client-only, server crashes if called
const saveToStorage = createClientOnlyFn((key: string, value: any) => {
  localStorage.setItem(key, JSON.stringify(value))
})

// Component: Only renders children after hydration
function Analytics() {
  return (
    <ClientOnly fallback={null}>
      <GoogleAnalyticsScript />
    </ClientOnly>
  )
}
```

#### useHydrated Hook

For more granular control over hydration-dependent behavior, use the `useHydrated` hook. It returns an accessor (signal) indicating whether the client has been hydrated:

```tsx
import { useHydrated } from '@tanstack/solid-router'

function TimeZoneDisplay() {
  const hydrated = useHydrated()
  const timeZone = () =>
    hydrated() ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'

  return <div>Your timezone: {timeZone()}</div>
}
```

**Behavior:**

- **During SSR**: Always returns `false`
- **First client render**: Returns `false`
- **After hydration**: Returns `true` (and stays `true` for all subsequent renders)

This is useful when you need to conditionally render content based on client-side data (like browser timezone, locale, or localStorage) while providing a sensible fallback for server rendering.

### Environment-Specific Implementations

```tsx
import { createIsomorphicFn } from '@tanstack/solid-start'

// Different implementation per environment
const getDeviceInfo = createIsomorphicFn()
  .server(() => ({ type: 'server', platform: process.platform }))
  .client(() => ({ type: 'client', userAgent: navigator.userAgent }))
```

## Architectural Patterns

### Progressive Enhancement

Build components that work without JavaScript and enhance with client-side functionality:

```tsx
function SearchForm() {
  const [query, setQuery] = createSignal('')

  return (
    <form action="/search" method="get">
      <input
        name="q"
        value={query()}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ClientOnly fallback={<button type="submit">Search</button>}>
        <SearchButton onSearch={() => search(query())} />
      </ClientOnly>
    </form>
  )
}
```

### Environment-Aware Storage

```tsx
const storage = createIsomorphicFn()
  .server((key: string) => {
    // Server: File-based cache
    const fs = require('node:fs')
    return JSON.parse(fs.readFileSync('.cache', 'utf-8'))[key]
  })
  .client((key: string) => {
    // Client: localStorage
    return JSON.parse(localStorage.getItem(key) || 'null')
  })
```

### RPC vs Direct Function Calls

Understanding when to use server functions vs server-only functions:

```tsx
// createServerFn: RPC pattern - server execution, client callable
const fetchUser = createServerFn().handler(async () => await db.users.find())

// Usage from client component:
const user = await fetchUser() // ✅ Network request

// createServerOnlyFn: Crashes if called from client
const getSecret = createServerOnlyFn(() => process.env.SECRET)

// Usage from client:
const secret = getSecret() // ❌ Throws error
```

## Common Anti-Patterns

### Environment Variable Exposure

```tsx
// ❌ Exposes to client bundle
const apiKey = process.env.SECRET_KEY

// ✅ Server-only access
const apiKey = createServerOnlyFn(() => process.env.SECRET_KEY)
```

### Top-Level Setup Statements

The compiler removes server code (server function handlers, `.server()` bodies, `createServerOnlyFn` implementations) from the client bundle, together with the imports only that code uses. Start's transform keeps every statement at the top level of a module in client code, so setup written as a statement (`if`, `try`, an assignment, `??=`) keeps its imports in the client bundle and runs in the browser when the module loads (a production bundler may still drop a branch whose condition it can tell is false). This is true in development and in production builds.

```tsx
// ❌ The `try` stays in client code: `./redis` is bundled and `connect()` runs in the browser
import { connect } from './redis'

let redis
try {
  redis = connect()
} catch {}

export const getCount = createServerFn().handler(() => redis.get('count'))
```

```tsx
// ✅ Put the setup in its own module, imported only by server code
// redis.server.ts
import { connect } from './redis'
export const redis = connect()

// count.ts
import { redis } from './redis.server'
export const getCount = createServerFn().handler(() => redis.get('count'))
```

A single `const` declaration also works: `const redis = connect()` leaves the client bundle with its import when only server code reads it. Naming the module `*.server.ts` lets [import protection](./import-protection.md) report it if client code ever imports it (a production build fails); for a package, add it to `importProtection.client.specifiers`.

The one shape the compiler refuses is server code passed by a name that a statement of the module assigns again: the implementation itself, given to `.handler()`, `.validator()`, `.server()`, `createServerOnlyFn()` or a route's `server`, `headers` or `ssr` option (`let impl = a; impl = b; createServerOnlyFn(impl)`, `if (!impl) impl = …`). The build fails at that argument, because the client would keep the assignments and the implementations they hold, whatever else reads or exports the binding. Define it once with a `const` (`const impl = condition ? a : b`). The setup above, where server code reads a value a statement sets up, is not refused: move it as shown.

### Incorrect Loader Assumptions

```tsx
// ❌ Assuming loader is server-only
export const Route = createFileRoute('/users')({
  loader: () => {
    // This runs on BOTH server and client!
    const secret = process.env.SECRET // Exposed to client
    return fetch(`/api/users?key=${secret}`)
  },
})

// ✅ Use server function for server-only operations
const getUsersSecurely = createServerFn().handler(() => {
  const secret = process.env.SECRET // Server-only
  return fetch(`/api/users?key=${secret}`)
})

export const Route = createFileRoute('/users')({
  loader: () => getUsersSecurely(), // Isomorphic call to server function
})
```

### Hydration Mismatches

```tsx
// ❌ Different content server vs client
function CurrentTime() {
  return <div>{new Date().toLocaleString()}</div>
}

// ✅ Consistent rendering
function CurrentTime() {
  const [time, setTime] = createSignal<string>()

  createEffect(() => {
    setTime(new Date().toLocaleString())
  })

  return <div>{time() || 'Loading...'}</div>
}
```

## Manual vs API-Driven Environment Detection

```tsx
// Manual: You handle the logic
function logMessage(msg: string) {
  if (typeof window === 'undefined') {
    console.log(`[SERVER]: ${msg}`)
  } else {
    console.log(`[CLIENT]: ${msg}`)
  }
}

// API: Framework handles it
const logMessage = createIsomorphicFn()
  .server((msg) => console.log(`[SERVER]: ${msg}`))
  .client((msg) => console.log(`[CLIENT]: ${msg}`))
```

## Architecture Decision Framework

**Choose Server-Only when:**

- Accessing sensitive data (environment variables, secrets)
- File system operations
- Database connections
- External API keys

**Choose Client-Only when:**

- DOM manipulation
- Browser APIs (localStorage, geolocation)
- User interaction handling
- Analytics/tracking

**Choose Isomorphic when:**

- Data formatting/transformation
- Business logic
- Shared utilities
- Route loaders (they're isomorphic by nature)

## Security Considerations

### Bundle Analysis

Always verify server-only code isn't included in client bundles:

```bash
# Analyze client bundle
npm run build
# Check dist/client for any server-only imports
```

### Environment Variable Strategy

- **Client-exposed**: Use `VITE_` prefix for client-accessible variables
- **Server-only**: Access via `createServerOnlyFn()` or `createServerFn()`
- **Never expose**: Database URLs, API keys, secrets

### Error Boundaries

Handle server/client execution errors gracefully:

```tsx
function ErrorBoundary(props) {
  return (
    <ErrorBoundaryComponent
      fallback={<div>Something went wrong</div>}
      onError={(error) => {
        if (typeof window === 'undefined') {
          console.error('[SERVER ERROR]:', error)
        } else {
          console.error('[CLIENT ERROR]:', error)
        }
      }}
    >
      {props.children}
    </ErrorBoundaryComponent>
  )
}
```

Understanding TanStack Start's execution model is crucial for building secure, performant, and maintainable applications. The isomorphic-by-default approach provides flexibility while the execution control APIs give you precise control when needed.
