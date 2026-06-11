# Search Param Defaults

Handle default values and migrations.

## Schema Defaults

```tsx
const searchSchema = z.object({
  page: z.number().default(1),
  limit: z.number().default(20),
  sort: z.enum(['date', 'title', 'author']).default('date'),
  order: z.enum(['asc', 'desc']).default('desc'),
  q: z.string().optional(),
})

export const Route = createFileRoute('/posts')({
  validateSearch: searchSchema,
})

// URL: /posts → { page: 1, limit: 20, sort: 'date', order: 'desc', q: undefined }
// URL: /posts?page=2 → { page: 2, limit: 20, sort: 'date', order: 'desc', q: undefined }
```

## Coercion

Transform string inputs to correct types:

```tsx
const searchSchema = z.object({
  page: z.coerce.number().default(1),
  enabled: z.coerce.boolean().default(true),
  ids: z.preprocess(
    (val) => (typeof val === 'string' ? val.split(',') : val),
    z.array(z.string()).default([]),
  ),
})
```

## Fallback for Invalid Values

```tsx
const searchSchema = z.object({
  sort: z.enum(['date', 'title']).catch('date'),
  // If invalid value provided, falls back to 'date'
})
```

## Migration Pattern

Handle schema changes gracefully:

```tsx
const searchSchema = z
  .object({
    // New field
    sortBy: z.enum(['date', 'title']).default('date'),
  })
  .transform((data) => {
    // Handle old field name
    if ('sort' in data) {
      return { ...data, sortBy: data.sort }
    }
    return data
  })
```

## Conditional Defaults

```tsx
const searchSchema = z
  .object({
    view: z.enum(['list', 'grid']).default('list'),
  })
  .transform((data) => ({
    ...data,
    // Default columns based on view
    columns: data.view === 'grid' ? 3 : 1,
  }))
```

## Clean URLs

Remove default values from URL:

```tsx
const navigate = useNavigate()

// Only include non-default values
const updateSearch = (updates: Partial<Search>) => {
  navigate({
    search: (prev) => {
      const next = { ...prev, ...updates }
      // Remove values that match defaults
      if (next.page === 1) delete next.page
      if (next.sort === 'date') delete next.sort
      return next
    },
  })
}
```
