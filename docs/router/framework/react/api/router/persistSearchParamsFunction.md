---
id: persistSearchParams
title: Search middleware to persist search params
---

`persistSearchParams` is a search middleware that automatically saves and restores search parameters when navigating between routes.

## persistSearchParams props

`persistSearchParams` accepts one of the following inputs:

- `undefined` (no arguments): persist all search params
- a list of keys of those search params that shall be excluded from persistence

## How it works

The middleware has two main functions:

1. **Saving**: Automatically saves search parameters when they change
2. **Restoring**: Restores saved parameters when the middleware is triggered with empty search

**Important**: The middleware only runs when search parameters are being processed. This means:

- **Without search prop**: `<Link to="/users">` → Middleware doesn't run → No restoration
- **With search function**: `<Link to="/users" search={(prev) => prev}>` → Middleware runs → Restoration happens
- **With explicit search**: `<Link to="/users" search={{ name: 'John' }}>` → Middleware runs → No restoration (params provided)

## Restoration Behavior

⚠️ **Unexpected behavior warning**: If you use the persistence middleware but navigate without the `search` prop, the middleware will only trigger later when you modify search parameters. This can cause unexpected restoration of saved parameters mixed with your new changes.

**Recommended**: Always be explicit about restoration intent using the `search` prop.

## Examples

```tsx
import { z } from 'zod'
import { createFileRoute, persistSearchParams } from '@tanstack/react-router'

const usersSearchSchema = z.object({
  name: z.string().optional().catch(''),
  status: z.enum(['active', 'inactive', 'all']).optional().catch('all'),
  page: z.number().optional().catch(0),
})

export const Route = createFileRoute('/users')({
  validateSearch: usersSearchSchema,
  search: {
    // persist all search params
    middlewares: [persistSearchParams()],
  },
})
```

```tsx
import { z } from 'zod'
import { createFileRoute, persistSearchParams } from '@tanstack/react-router'

const productsSearchSchema = z.object({
  category: z.string().optional(),
  minPrice: z.number().optional(),
  maxPrice: z.number().optional(),
  tempFilter: z.string().optional(),
})

export const Route = createFileRoute('/products')({
  validateSearch: productsSearchSchema,
  search: {
    // exclude tempFilter from persistence
    middlewares: [persistSearchParams(['tempFilter'])],
  },
})
```

```tsx
import { z } from 'zod'
import { createFileRoute, persistSearchParams } from '@tanstack/react-router'

const searchSchema = z.object({
  category: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
  tempFilter: z.string().optional(),
})

export const Route = createFileRoute('/products')({
  validateSearch: searchSchema,
  search: {
    // exclude tempFilter and sortBy from persistence
    middlewares: [persistSearchParams(['tempFilter', 'sortBy'])],
  },
})
```

## Restoration Patterns

### Automatic Restoration with Links

Use `search={(prev) => prev}` to trigger middleware restoration:

```tsx
import { Link } from '@tanstack/react-router'

function Navigation() {
  return (
    <div>
      {/* Full restoration - restores all saved parameters */}
      <Link to="/users" search={(prev) => prev}>
        Users
      </Link>

      {/* Partial override - restore saved params but override specific ones */}
      <Link
        to="/products"
        search={(prev) => ({ ...prev, category: 'Electronics' })}
      >
        Electronics Products
      </Link>

      {/* Clean navigation - no restoration */}
      <Link to="/users">Users (clean slate)</Link>
    </div>
  )
}
```

### Exclusion Strategies

You have two ways to exclude parameters from persistence:

**1. Middleware-level exclusion** (permanent):

```tsx
// These parameters are never saved
middlewares: [persistSearchParams(['tempFilter', 'sortBy'])]
```

**2. Link-level exclusion** (per navigation):

```tsx
// Restore saved params but exclude specific ones
<Link
  to="/products"
  search={(prev) => {
    const { tempFilter, ...rest } = prev || {}
    return rest
  }}
>
  Products (excluding temp filter)
</Link>
```

### Manual Restoration

Access the store directly for full control:

```tsx
import { getSearchPersistenceStore, Link } from '@tanstack/react-router'

function CustomNavigation() {
  const store = getSearchPersistenceStore()
  const savedUsersSearch = store.getSearch('/users')

  return (
    <Link to="/users" search={savedUsersSearch || {}}>
      Users (with saved search)
    </Link>
  )
}
```

## Using the search persistence store

You can also access the search persistence store directly for manual control:

```tsx
import { getSearchPersistenceStore } from '@tanstack/react-router'

// Get the fully typed store instance
const store = getSearchPersistenceStore()

// Get persisted search for a route
const savedSearch = store.getSearch('/users')

// Clear persisted search for a specific route
store.clearSearch('/users')

// Clear all persisted searches
store.clearAllSearches()

// Manually save search for a route
store.saveSearch('/users', { name: 'John', status: 'active' })
```

```tsx
import { getSearchPersistenceStore } from '@tanstack/react-router'
import { useStore } from '@tanstack/react-store'
import React from 'react'

function MyComponent() {
  const store = getSearchPersistenceStore()
  const storeState = useStore(store.store)

  const clearUserSearch = () => {
    store.clearSearch('/users')
  }

  return (
    <div>
      <p>Saved search: {JSON.stringify(storeState['/users'])}</p>
      <button onClick={clearUserSearch}>Clear saved search</button>
    </div>
  )
}
```
