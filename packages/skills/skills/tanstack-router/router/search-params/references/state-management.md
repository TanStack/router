# Search Params as State

Use URL search params for application state.

## Benefits

- Shareable URLs
- Browser back/forward works
- No extra state management
- Survives refresh

## URL-Driven UI Pattern

```tsx
const searchSchema = z.object({
  tab: z.enum(['overview', 'details', 'settings']).default('overview'),
  modal: z.enum(['edit', 'delete']).optional(),
})

export const Route = createFileRoute('/posts/$postId')({
  validateSearch: searchSchema,
})

function PostPage() {
  const { tab, modal } = Route.useSearch()
  const navigate = useNavigate()

  return (
    <>
      <Tabs
        value={tab}
        onChange={(t) => navigate({ search: (prev) => ({ ...prev, tab: t }) })}
      >
        <Tab value="overview">Overview</Tab>
        <Tab value="details">Details</Tab>
      </Tabs>

      {tab === 'overview' && <Overview />}
      {tab === 'details' && <Details />}

      {modal === 'edit' && <EditModal />}
      {modal === 'delete' && <DeleteModal />}
    </>
  )
}
```

## Filter State

```tsx
const filterSchema = z.object({
  q: z.string().default(''),
  status: z.enum(['all', 'active', 'completed']).default('all'),
  sort: z.enum(['date', 'title']).default('date'),
  order: z.enum(['asc', 'desc']).default('desc'),
})

function FilterBar() {
  const search = Route.useSearch()
  const navigate = useNavigate()

  const updateSearch = (updates: Partial<typeof search>) => {
    navigate({ search: (prev) => ({ ...prev, ...updates }) })
  }

  return (
    <div>
      <input
        value={search.q}
        onChange={(e) => updateSearch({ q: e.target.value })}
      />
      <select
        value={search.status}
        onChange={(e) => updateSearch({ status: e.target.value })}
      >
        <option value="all">All</option>
        <option value="active">Active</option>
      </select>
    </div>
  )
}
```

## Pagination

```tsx
const paginationSchema = z.object({
  page: z.number().default(1),
  limit: z.number().default(20),
})

function Pagination() {
  const { page, limit } = Route.useSearch()
  const navigate = useNavigate()

  return (
    <div>
      <button
        onClick={() =>
          navigate({
            search: (prev) => ({ ...prev, page: prev.page - 1 }),
          })
        }
        disabled={page === 1}
      >
        Previous
      </button>
      <span>Page {page}</span>
      <button
        onClick={() =>
          navigate({
            search: (prev) => ({ ...prev, page: prev.page + 1 }),
          })
        }
      >
        Next
      </button>
    </div>
  )
}
```
