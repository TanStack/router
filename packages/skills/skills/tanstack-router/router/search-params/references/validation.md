# Search Param Validation

Type-safe validation for URL search parameters.

## Zod Adapter (Recommended)

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

const searchSchema = z.object({
  page: z.number().default(1),
  filter: z.enum(['all', 'active', 'completed']).default('all'),
  q: z.string().optional(),
})

export const Route = createFileRoute('/posts')({
  validateSearch: searchSchema,
})
```

## Valibot Adapter

```tsx
import { fallback, object, optional, number, string, picklist } from 'valibot'

const searchSchema = object({
  page: fallback(number(), 1),
  filter: fallback(picklist(['all', 'active', 'completed']), 'all'),
  q: optional(string()),
})

export const Route = createFileRoute('/posts')({
  validateSearch: searchSchema,
})
```

## ArkType Adapter

```tsx
import { type } from 'arktype'

const searchSchema = type({
  'page?': 'number',
  'filter?': "'all' | 'active' | 'completed'",
  'q?': 'string',
})

export const Route = createFileRoute('/posts')({
  validateSearch: searchSchema,
})
```

## Manual Validation

```tsx
export const Route = createFileRoute('/posts')({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      page: Number(search.page) || 1,
      filter: ['all', 'active', 'completed'].includes(search.filter as string)
        ? (search.filter as string)
        : 'all',
      q: typeof search.q === 'string' ? search.q : undefined,
    }
  },
})
```

## Accessing Validated Search

```tsx
function PostsComponent() {
  // Fully typed based on schema
  const { page, filter, q } = Route.useSearch()
}
```

## Link Type Safety

```tsx
// TypeScript enforces valid search params
<Link
  to="/posts"
  search={{ page: 1, filter: 'active' }}  // ✓ Valid
/>

<Link
  to="/posts"
  search={{ page: 'one' }}  // ✗ Error: page must be number
/>
```

## API Reference

### useSearch Hook

```tsx
function useSearch<TFrom, TStrict, TSelected>(options: {
  from: TFrom // Route ID to get search from
  strict?: TStrict // Default: true, set false for loose types
  select?: (search) => TSelected // Transform the search object
  shouldThrow?: boolean // Default: true, throw if route not matched
  structuralSharing?: boolean // Enable structural sharing for select
}): TSelected | SearchSchema

// Examples
const search = useSearch({ from: '/posts' }) // Full search schema
const page = useSearch({ from: '/posts', select: (s) => s.page }) // Selected field
const loose = useSearch({ strict: false }) // Partial<FullSearchSchema>
```

### Route.useSearch

Shorthand when inside a route component:

```tsx
function PostsComponent() {
  const search = Route.useSearch() // Automatically typed from route
}
```

### validateSearch Option

```tsx
interface RouteOptions {
  validateSearch?:
    | ZodSchema
    | ValibotSchema
    | ArkTypeSchema
    | ((search: Record<string, unknown>) => ValidatedSearch)
}
```
