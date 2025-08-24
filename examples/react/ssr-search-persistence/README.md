# SSR Search Persistence with Database Example

This example demonstrates TanStack Router's SSR-safe search parameter persistence using the new per-router store injection pattern, complete with a demo database that syncs with the SearchPersistenceStore.

## Features

- **SSR-Safe**: Each SSR request gets its own `SearchPersistenceStore` instance
- **Route Isolation**: Search parameters are isolated per route (no contamination)
- **Selective Persistence**: Choose which search params to persist vs. exclude
- **Client Hydration**: Seamless client-side hydration maintains search state
- **Database Integration**: Demo database automatically syncs with search persistence store
- **Real-time Updates**: Database records update live as you navigate and filter

## Key Implementation Details

### Per-Request Store Creation (SSR)

```tsx
// entry-server.tsx
const requestSearchStore = new SearchPersistenceStore()
router.update({
  searchPersistenceStore: requestSearchStore,
})
```

### Client-Side Store (Browser)

```tsx
// router.tsx
const searchPersistenceStore =
  typeof window !== 'undefined' ? new SearchPersistenceStore() : undefined
```

### Route Configuration

```tsx
// routes/products.tsx
search: {
  middlewares: [
    persistSearchParams(['category', 'minPrice', 'maxPrice'], ['sortBy'])
  ],
}
```

### Database Integration

```tsx
// lib/searchDatabase.ts
export class SearchDatabase {
  // Syncs with SearchPersistenceStore
  syncWithStore(store: SearchPersistenceStore, userId = 'anonymous'): () => void

  // Subscribe to changes
  subscribe(callback: () => void): () => void

  // CRUD operations
  saveSearchParams(routeId: string, searchParams: Record<string, unknown>): void
  getSearchParams(routeId: string): Record<string, unknown> | null
}
```

### Database Provider

```tsx
// lib/SearchDatabaseProvider.tsx
<SearchDatabaseProvider>
  {/* Your app with automatic database sync */}
</SearchDatabaseProvider>
```

## Running the Example

```bash
pnpm install
pnpm run dev
```

Then open http://localhost:3000

## Testing Search Persistence + Database

1. Navigate to Products, set some filters
2. Go to Database tab - see your search params stored in real-time!
3. Navigate to Users, set different filters
4. Check Database again - both routes have isolated records
5. Navigate back to Products - your filters persist from database!
6. Refresh the page - everything restores correctly from database
7. Each route maintains its own isolated search state in the database
