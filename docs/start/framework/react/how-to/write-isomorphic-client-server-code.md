# How to Write Isomorphic, Client-Only, and Server-Only Code

This guide covers TanStack Start's execution model and APIs for controlling where code runs.

## Core Principle: Isomorphic by Default

**All code in TanStack Start is isomorphic by default** - it runs and is included in both server and client bundles unless explicitly constrained.

```tsx
// ✅ This runs on BOTH server and client
function formatPrice(price: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(price)
}

// ✅ Route loaders are ISOMORPHIC (not server-only!)
export const Route = createFileRoute('/products')({
  loader: async () => {
    // This runs on server during SSR AND on client during navigation
    const response = await fetch('/api/products')
    return response.json()
  }
})
```

**Common misconception**: Route `loader`s are server-only (like Remix). They're not - they're isomorphic.

---

## When You Need Execution Constraints

### Server-Only APIs

| API | Use Case | Client Behavior |
|-----|----------|-----------------|
| `createServerFn()` | RPC calls, data mutations | Network request to server |
| `serverOnly(fn)` | Utility functions | Throws error |

```tsx
import { createServerFn, serverOnly } from '@tanstack/react-start'

// RPC: Server execution, callable from client
const updateUser = createServerFn({ method: 'POST' })
  .validator((data: UserData) => data)
  .handler(async ({ data }) => {
    // Only runs on server, but client can call it
    return await db.users.update(data)
  })

// Utility: Server-only, client crashes if called
const getEnvVar = serverOnly(() => process.env.DATABASE_URL)
```

### Client-Only APIs

| API | Use Case | Server Behavior |
|-----|----------|-----------------|
| `clientOnly(fn)` | Browser utilities | Throws error |
| `<ClientOnly>` | Components needing browser APIs | Renders fallback |

```tsx
import { clientOnly } from '@tanstack/react-start'
import { ClientOnly } from '@tanstack/react-router'

// Utility: Client-only, server crashes if called
const saveToStorage = clientOnly((key: string, value: any) => {
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

### Environment-Specific Implementations

```tsx
import { createIsomorphicFn } from '@tanstack/react-start'

// Different implementation per environment
const getDeviceInfo = createIsomorphicFn()
  .server(() => ({ type: 'server', platform: process.platform }))
  .client(() => ({ type: 'client', userAgent: navigator.userAgent }))
```

---

## Key Distinctions

### `createServerFn()` vs `serverOnly()`

```tsx
// createServerFn: RPC pattern - server execution, client callable
const fetchUser = createServerFn()
  .handler(async () => await db.users.find())

// Usage from client component:
const user = await fetchUser() // ✅ Network request

// serverOnly: Crashes if called from client
const getSecret = serverOnly(() => process.env.SECRET)

// Usage from client:
const secret = getSecret() // ❌ Throws error
```

### Manual Environment Detection vs APIs

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

---

## Common Patterns

### Progressive Enhancement

```tsx
// Component works without JS, enhanced with JS
function SearchForm() {
  const [query, setQuery] = useState('')
  
  return (
    <form action="/search" method="get">
      <input 
        name="q" 
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ClientOnly fallback={<button type="submit">Search</button>}>
        <SearchButton onSearch={() => search(query)} />
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

---

## Common Problems

### Environment Variable Exposure

```tsx
// ❌ Exposes to client bundle
const apiKey = process.env.SECRET_KEY

// ✅ Server-only access
const apiKey = serverOnly(() => process.env.SECRET_KEY)
```

### Incorrect Loader Assumptions

```tsx
// ❌ Assuming loader is server-only
export const Route = createFileRoute('/users')({
  loader: () => {
    // This runs on BOTH server and client!
    const secret = process.env.SECRET // Exposed to client
    return fetch(`/api/users?key=${secret}`)
  }
})

// ✅ Use server function for server-only operations
const getUsersSecurely = createServerFn().handler(() => {
  const secret = process.env.SECRET // Server-only
  return fetch(`/api/users?key=${secret}`)
})

export const Route = createFileRoute('/users')({
  loader: () => getUsersSecurely() // Isomorphic call to server function
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
  const [time, setTime] = useState<string>()
  
  useEffect(() => {
    setTime(new Date().toLocaleString())
  }, [])
  
  return <div>{time || 'Loading...'}</div>
}
```

---

## Production Checklist

- [ ] **Bundle Analysis**: Verify server-only code isn't in client bundle
- [ ] **Environment Variables**: Ensure secrets use `serverOnly()` or `createServerFn()`
- [ ] **Loader Logic**: Remember loaders are isomorphic, not server-only
- [ ] **ClientOnly Fallbacks**: Provide appropriate fallbacks to prevent layout shift
- [ ] **Error Boundaries**: Handle server/client execution errors gracefully

---

## Related Resources

- [TanStack Start Server Functions Guide](../server-functions.md)
- [TanStack Start Middleware Guide](../middleware.md)
- [TanStack Router SSR Guide](../../../router/framework/react/how-to/setup-ssr.md)

<!-- Next Steps (commented until guides exist)
- [How to Create Basic Server Functions](./create-basic-server-functions.md)
- [How to Write Type-Safe Server Functions](./write-type-safe-server-functions.md)
- [How to Use Server Function Middleware](./use-server-function-middleware.md)
-->