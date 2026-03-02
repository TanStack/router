# External Data (TanStack Query Integration)

Use TanStack Query for advanced data management.

## Setup

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

// Provide to router context
const router = createRouter({
  routeTree,
  context: { queryClient },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
```

## Using in Loaders

```tsx
import { useSuspenseQuery } from '@tanstack/react-query'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ context, params }) => {
    // Ensure data is in cache
    await context.queryClient.ensureQueryData({
      queryKey: ['posts', params.postId],
      queryFn: () => fetchPost(params.postId),
    })
  },
  component: PostComponent,
})

function PostComponent() {
  const { postId } = Route.useParams()

  // useSuspenseQuery - data is guaranteed from loader
  const { data: post } = useSuspenseQuery({
    queryKey: ['posts', postId],
    queryFn: () => fetchPost(postId),
  })

  return <article>{post.title}</article>
}
```

## Query Options Pattern

Define query options once:

```tsx
// queries/posts.ts
export const postQueryOptions = (postId: string) => ({
  queryKey: ['posts', postId],
  queryFn: () => fetchPost(postId),
})

// In route
loader: async ({ context, params }) => {
  await context.queryClient.ensureQueryData(postQueryOptions(params.postId))
}

// In component
const { data } = useSuspenseQuery(postQueryOptions(postId))
```

## Benefits Over Plain Loaders

- **Caching**: Automatic cache management
- **Background refetching**: Stale-while-revalidate
- **Mutations**: Built-in mutation handling
- **Devtools**: Query devtools for debugging
- **Deduplication**: Same query runs once

## Invalidation After Mutation

```tsx
const mutation = useMutation({
  mutationFn: updatePost,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['posts'] })
  },
})
```
