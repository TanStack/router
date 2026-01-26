# Execution Model

Understanding where code runs in TanStack Start.

## Code Boundaries

```
┌─────────────────────────────────────────────────────┐
│                     SERVER                          │
│  - Server functions (createServerFn)                │
│  - Route loaders (during SSR)                       │
│  - beforeLoad (during SSR)                          │
│  - API routes                                       │
│  - Middleware                                       │
└─────────────────────────────────────────────────────┘
                         │
                    HTTP Request
                         │
┌─────────────────────────────────────────────────────┐
│                     CLIENT                          │
│  - Components (after hydration)                     │
│  - Event handlers                                   │
│  - Client-side navigation                           │
│  - Route loaders (after initial load)               │
└─────────────────────────────────────────────────────┘
```

## Server Functions Always Run on Server

```tsx
import { createServerFn } from '@tanstack/start'

const getSecretData = createServerFn().handler(async () => {
  // ALWAYS runs on server
  // Safe to use secrets, database, etc.
  return db.query(process.env.SECRET_KEY)
})

// Called from client, executed on server
function Component() {
  useEffect(() => {
    getSecretData().then(setData) // RPC call to server
  }, [])
}
```

## Loaders: Context-Dependent

```tsx
export const Route = createFileRoute('/posts')({
  loader: async () => {
    // SSR: Runs on SERVER
    // Client navigation: Runs on CLIENT (via server function)
    return fetchPosts()
  },
})
```

## Components: Both, Then Client

```tsx
function PostList() {
  // SSR: Renders on SERVER (generates HTML)
  // Hydration: "Attaches" on CLIENT
  // After: Fully CLIENT-side

  const handleClick = () => {
    // Only runs on CLIENT (event handler)
  }

  return <button onClick={handleClick}>Click</button>
}
```

## Import Boundaries

```tsx
// This import only available on server
import { db } from './server-only-db'

const getData = createServerFn().handler(async () => {
  return db.query() // ✓ Safe - server function
})

function Component() {
  // db.query()  // ✗ Error - would run on client
  getData() // ✓ Safe - calls server function
}
```

## Tree-Shaking Server Code

Server-only code is removed from client bundle:

```tsx
// server-utils.ts
export const serverOnly = () => {
  // This is tree-shaken from client bundle
  // when only used in server functions
}

// Used in server function → not in client bundle
const fn = createServerFn().handler(() => serverOnly())
```
