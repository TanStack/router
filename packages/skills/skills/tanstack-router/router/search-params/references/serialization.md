# Search Param Serialization

Custom serialization for complex search param types.

## Default Behavior

By default, search params are serialized as URL query strings:

```
{ page: 1, filter: 'active' } → ?page=1&filter=active
```

## JSON Serialization

For complex objects/arrays:

```tsx
import { createRouter } from '@tanstack/react-router'

const router = createRouter({
  routeTree,
  // Use JSON for all search params
  stringifySearch: (search) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(search)) {
      params.set(key, JSON.stringify(value))
    }
    return params.toString()
  },
  parseSearch: (search) => {
    const params = new URLSearchParams(search)
    const result: Record<string, unknown> = {}
    for (const [key, value] of params.entries()) {
      try {
        result[key] = JSON.parse(value)
      } catch {
        result[key] = value
      }
    }
    return result
  },
})
```

## Arrays in Search Params

```tsx
// With JSON serialization
const schema = z.object({
  tags: z.array(z.string()).default([]),
})

// URL: ?tags=["react","router"]
```

## Complex Objects

```tsx
const schema = z.object({
  filters: z
    .object({
      status: z.enum(['active', 'archived']),
      dateRange: z.object({
        from: z.string(),
        to: z.string(),
      }),
    })
    .optional(),
})

// URL: ?filters={"status":"active","dateRange":{"from":"2024-01","to":"2024-12"}}
```

## Using JSURL2

More compact serialization:

```tsx
import { stringify, parse } from 'jsurl2'

const router = createRouter({
  routeTree,
  stringifySearch: stringify,
  parseSearch: parse,
})
```

## Per-Route Serialization

```tsx
export const Route = createFileRoute('/search')({
  validateSearch: searchSchema,
  search: {
    strict: true, // Only allow defined params
  },
})
```
