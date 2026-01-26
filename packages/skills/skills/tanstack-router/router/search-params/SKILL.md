---
name: tanstack-router-search-params
description: |
  Type-safe search parameter handling in TanStack Router.
  Use for URL search params, validation, serialization, and state management.
---

# Search Params

TanStack Router provides first-class, type-safe search parameter handling. Search params are validated, serialized, and fully integrated with TypeScript.

## Common Patterns

### Basic Search Param Validation

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({
  validateSearch: (search: Record<string, unknown>) => ({
    page: Number(search.page) || 1,
    filter: (search.filter as string) || '',
    sortBy: (search.sortBy as 'date' | 'title') || 'date',
  }),
  component: PostsComponent,
})

function PostsComponent() {
  const { page, filter, sortBy } = Route.useSearch()
  // All fully typed: page is number, filter is string, sortBy is 'date' | 'title'
}
```

### Zod Validation (Recommended)

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

const searchSchema = z.object({
  page: z.number().catch(1),
  filter: z.string().catch(''),
  tags: z.array(z.string()).catch([]),
  showDrafts: z.boolean().catch(false),
})

export const Route = createFileRoute('/posts')({
  validateSearch: searchSchema,
  component: PostsComponent,
})

function PostsComponent() {
  const search = Route.useSearch()
  // search.page: number
  // search.filter: string
  // search.tags: string[]
  // search.showDrafts: boolean
}
```

### Updating Search Params

```tsx
import { useNavigate } from '@tanstack/react-router'

function PostsComponent() {
  const { page, filter } = Route.useSearch()
  const navigate = useNavigate()

  // Replace specific params (merge with existing)
  const setPage = (newPage: number) => {
    navigate({
      search: (prev) => ({ ...prev, page: newPage }),
    })
  }

  // Set filter and reset page
  const setFilter = (newFilter: string) => {
    navigate({
      search: (prev) => ({ ...prev, filter: newFilter, page: 1 }),
    })
  }

  // Clear all search params
  const clearFilters = () => {
    navigate({ search: {} })
  }

  return (
    <div>
      <input value={filter} onChange={(e) => setFilter(e.target.value)} />
      <button onClick={() => setPage(page + 1)}>Next Page</button>
      <button onClick={clearFilters}>Clear</button>
    </div>
  )
}
```

### Links with Search Params

```tsx
// Set search params in Link
<Link to="/posts" search={{ page: 2, filter: 'react' }}>
  React Posts (Page 2)
</Link>

// Merge with existing search params
<Link
  to="."
  search={(prev) => ({ ...prev, page: prev.page + 1 })}
>
  Next Page
</Link>

// Type-safe: TypeScript will error if search params don't match
<Link
  to="/posts"
  search={{ page: 'two' }}  // ✗ Error: page must be number
>
  Invalid
</Link>
```

### Default Values with .catch()

Use Zod's `.catch()` for safe defaults:

```tsx
const searchSchema = z.object({
  // Defaults to 1 if missing/invalid
  page: z.number().catch(1),

  // Defaults to empty string
  query: z.string().catch(''),

  // Defaults to empty array
  tags: z.array(z.string()).catch([]),

  // Defaults to 'date' if not valid enum
  sort: z.enum(['date', 'title', 'author']).catch('date'),

  // Optional with no default (can be undefined)
  category: z.string().optional(),
})
```

### Complex Search State

```tsx
const searchSchema = z.object({
  filters: z
    .object({
      status: z.enum(['all', 'active', 'archived']).catch('all'),
      dateRange: z
        .object({
          start: z.string().optional(),
          end: z.string().optional(),
        })
        .catch({ start: undefined, end: undefined }),
    })
    .catch({ status: 'all', dateRange: {} }),

  pagination: z
    .object({
      page: z.number().catch(1),
      pageSize: z.number().catch(20),
    })
    .catch({ page: 1, pageSize: 20 }),
})

export const Route = createFileRoute('/dashboard')({
  validateSearch: searchSchema,
})

// URL: /dashboard?filters={"status":"active"}&pagination={"page":2}
```

### Search Param Serialization

Custom serialization for complex types:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/events')({
  validateSearch: (search) => ({
    // Parse date from ISO string
    date: search.date ? new Date(search.date as string) : new Date(),
    // Parse array from comma-separated
    ids:
      typeof search.ids === 'string' ? search.ids.split(',').map(Number) : [],
  }),
})

// To serialize when navigating:
navigate({
  search: {
    date: selectedDate.toISOString(),
    ids: selectedIds.join(','),
  },
})
```

### Sharing Search State Across Routes

```tsx
// Define shared search schema
const globalSearchSchema = z.object({
  theme: z.enum(['light', 'dark']).catch('light'),
  locale: z.string().catch('en'),
})

// Use in root route
export const Route = createRootRoute({
  validateSearch: globalSearchSchema,
})

// Child routes inherit and can extend
export const Route = createFileRoute('/posts')({
  validateSearch: (search) => ({
    ...globalSearchSchema.parse(search),
    page: z.number().catch(1).parse(search.page),
  }),
})
```

## API Quick Reference

```tsx
// Route option
validateSearch: ZodSchema | ValibotSchema | ((search: unknown) => Validated)

// Hook to read search params
const search = Route.useSearch()
const search = useSearch({ from: '/posts' })

// Select specific values (optimizes re-renders)
const page = useSearch({ from: '/posts', select: (s) => s.page })

// Update search params via navigate
navigate({ search: newSearch })
navigate({ search: (prev) => ({ ...prev, ...updates }) })

// Search params in Link
<Link to="/posts" search={{ page: 1 }} />
<Link to="." search={(prev) => ({ ...prev, page: prev.page + 1 })} />

// Zod patterns for defaults
z.string().catch('')           // Default to empty string
z.number().catch(0)            // Default to 0
z.boolean().catch(false)       // Default to false
z.array(z.string()).catch([])  // Default to empty array
z.enum(['a', 'b']).catch('a')  // Default to first enum value
z.object({...}).catch({...})   // Default to object
```

## Detailed References

| Reference                        | When to Use                                         |
| -------------------------------- | --------------------------------------------------- |
| `references/validation.md`       | Zod/Valibot/Arktype schemas, custom validators      |
| `references/serialization.md`    | Custom serialization, complex types, dates, arrays  |
| `references/state-management.md` | URL as state, syncing with React state, persistence |
| `references/defaults.md`         | Default values, .catch() patterns, optional params  |
