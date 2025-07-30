# How to Write Isomorphic, Client-Only, and Server-Only Code

Learn TanStack Start's execution model and when to constrain code to specific environments.

## Execution Model: Isomorphic by Default

**All code runs on both server and client unless explicitly constrained.**

```tsx
// ✅ Isomorphic - runs everywhere
function formatPrice(price: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(price)
}

// ✅ Route loaders are isomorphic (server during SSR, client during navigation)
export const Route = createFileRoute('/products')({
  loader: async () => {
    const response = await fetch('/api/products')
    return response.json()
  }
})
```

## Execution Constraint APIs

| API | Use Case | Opposite Environment |
|-----|----------|---------------------|
| `createServerFn()` | RPC calls, data mutations | Network request to server |
| `serverOnly(fn)` | Secrets, server utilities | Throws error |
| `clientOnly(fn)` | Browser APIs, DOM | Throws error |
| `<ClientOnly>` | Hydration-safe components | Renders fallback |

## When to Use Each Pattern

### Server Functions (RPC Pattern)
```tsx
import { createServerFn } from '@tanstack/start'

// Client can call this via network request
const updateUser = createServerFn()
  .validator(z.object({ id: z.string(), name: z.string() }))
  .handler(async ({ data }) => {
    return await db.users.update(data.id, { name: data.name })
  })

// Usage from client
const result = await updateUser({ data: { id: '1', name: 'John' } })
```

### Server-Only Utilities
```tsx
import { serverOnly } from '@tanstack/start'

// Crashes if called from client
const getSecret = serverOnly(() => process.env.SECRET_KEY)

// Use in server functions, loaders, or server components
const secret = getSecret() // ✅ Works in server contexts only
```

### Client-Only Code
```tsx
import { clientOnly } from '@tanstack/start'
import { ClientOnly } from '@tanstack/react-router'

// Crashes if called from server
const saveToStorage = clientOnly((key: string, value: string) => {
  localStorage.setItem(key, value)
})

// Component that only renders after hydration
function BrowserOnlyFeature() {
  return (
    <ClientOnly fallback={<div>Loading...</div>}>
      <GeolocationComponent />
    </ClientOnly>
  )
}
```

### Manual Environment Detection
```tsx
// When you need custom logic for each environment
function logEvent(event: string) {
  if (typeof window !== 'undefined') {
    // Client: Analytics
    gtag('event', event)
  } else {
    // Server: Logging
    console.log(`Server event: ${event}`)
  }
}
```

## Key Distinctions

### `createServerFn()` vs `serverOnly()`

```tsx
// createServerFn: Client can call via network
const fetchUser = createServerFn()
  .handler(async () => await db.users.find())

const user = await fetchUser() // ✅ Works from client (network request)

// serverOnly: Pure server constraint
const getSecret = serverOnly(() => process.env.SECRET)

const secret = getSecret() // ❌ Crashes if called from client
```

### `clientOnly()` vs `<ClientOnly>`

```tsx
// clientOnly: Function constraint
const analytics = clientOnly(() => gtag('event', 'click'))

// ClientOnly: Component constraint (handles hydration)
<ClientOnly fallback={<Spinner />}>
  <InteractiveMap />
</ClientOnly>
```

## Production Checklist

### Security
- [ ] **Secrets**: Use `serverOnly()` for environment variables and sensitive data
- [ ] **Validation**: Server functions validate all inputs
- [ ] **Client Code**: No sensitive logic in client-accessible code

### Performance  
- [ ] **Bundle Size**: Use constraints to exclude code from appropriate bundles
- [ ] **Hydration**: Use `<ClientOnly>` for components requiring browser APIs
- [ ] **Network**: Minimize server function call frequency

### Type Safety
- [ ] **Server Functions**: Proper validation schemas
- [ ] **Environment Detection**: Consistent patterns across codebase
- [ ] **Error Handling**: Graceful degradation when constraints are violated

## Common Next Steps

After understanding isomorphic code patterns, you might want to:

- [Create Basic Server Functions](./create-basic-server-functions.md) - Learn how to create server functions with validation and error handling

<!-- Additional Next Steps (commented until guides exist)
- [How to Write Type-Safe Server Functions](./write-type-safe-server-functions.md)
- [How to Use Server Function Middleware](./use-server-function-middleware.md)
-->

## Related Resources

- [TanStack Start Server Functions Guide](../server-functions.md)
- [TanStack Start Middleware Guide](../middleware.md)
- [TanStack Router SSR Guide](../../../router/framework/react/how-to/setup-ssr.md)