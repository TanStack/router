# Search Persistence Example

This example demonstrates TanStack Router's search persistence middleware, which automatically saves and restores search parameters when navigating between routes.

## Overview

The `persistSearchParams` middleware provides seamless search parameter persistence across route navigation. Search parameters are automatically saved when you leave a route and restored when you return, maintaining user context and improving UX.

## Key Features

- **Automatic Persistence**: Search parameters are saved/restored automatically
- **Selective Exclusion**: Choose which parameters to exclude from persistence  
- **Type Safety**: Full TypeScript support with automatic type inference
- **Manual Control**: Direct store access for advanced use cases

## Basic Usage

```tsx
import { createFileRoute, persistSearchParams } from '@tanstack/react-router'

// Persist all search parameters
export const Route = createFileRoute('/users')({
  validateSearch: usersSearchSchema,
  search: {
    middlewares: [persistSearchParams()],
  },
})

// Exclude specific parameters from persistence
export const Route = createFileRoute('/products')({
  validateSearch: productsSearchSchema,
  search: {
    middlewares: [persistSearchParams(['tempFilter', 'sortBy'])],
  },
})
```

## Restoration Patterns

⚠️ **Important**: The middleware only runs when search parameters are being processed. Always be explicit about your restoration intent.

### Automatic Restoration
```tsx
import { Link } from '@tanstack/react-router'

// Full restoration - restores all saved parameters
<Link to="/users" search={(prev) => prev}>
  Users (restore all)
</Link>

// Partial override - restore but override specific parameters  
<Link to="/products" search={(prev) => ({ ...prev, category: 'Electronics' })}>
  Electronics Products
</Link>

// Clean navigation - no restoration
<Link to="/users">
  Users (clean slate)
</Link>
```

### Manual Restoration  
Access the store directly for full control:

```tsx
import { getSearchPersistenceStore } from '@tanstack/react-router'

const store = getSearchPersistenceStore()
const savedSearch = store.getSearch('/users')

<Link to="/users" search={savedSearch || {}}>
  Users (manual restoration)
</Link>
```

### ⚠️ Unexpected Behavior Warning

If you use the persistence middleware but navigate without the `search` prop, restoration will only trigger later when you modify search parameters. This can cause saved parameters to unexpectedly appear mixed with your new changes.

**Recommended**: Always use the `search` prop to be explicit about restoration intent.

## Try It

1. Navigate to `/users` and search for a name
2. Navigate to `/products` and set some filters  
3. Use the test links on the homepage to see both restoration patterns!

## Running the Example

```bash
pnpm install
pnpm dev
```

Navigate between Users and Products routes to see automatic search parameter persistence in action.