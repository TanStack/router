---
name: react-query-integration
---

# React Query Integration

Integrating TanStack Router with TanStack Query for data fetching.

## Installation

```bash
npm install @tanstack/react-query
```

## Basic Setup

### Query Client Provider

```tsx
// routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
})

export const Route = createRootRoute({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  ),
})
```

## Router Context Integration

### Typed Router Context

```tsx
// router.tsx
import { createRouter } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import { routeTree } from './routeTree.gen'

export const queryClient = new QueryClient()

export const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```

### Root Route with Context

```tsx
// routes/__root.tsx
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => {
    const { queryClient } = Route.useRouteContext()
    return (
      <QueryClientProvider client={queryClient}>
        <Outlet />
      </QueryClientProvider>
    )
  },
})
```

## Data Loading Patterns

### Loader with ensureQueryData

```tsx
// routes/posts.$id.tsx
import { createFileRoute } from '@tanstack/react-router'

async function fetchPost(id: string) {
  const res = await fetch(`/api/posts/${id}`)
  if (!res.ok) throw new Error('Post not found')
  return res.json()
}

export const Route = createFileRoute('/posts/$id')({
  loader: async ({ params, context: { queryClient } }) => {
    return queryClient.ensureQueryData({
      queryKey: ['post', params.id],
      queryFn: () => fetchPost(params.id),
    })
  },
  component: PostDetail,
})

function PostDetail() {
  const post = Route.useLoaderData()

  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.content}</p>
    </article>
  )
}
```

### Deferred Loading with useQuery

```tsx
// For data that can load after render
import { useQuery } from '@tanstack/react-query'

function PostComments({ postId }: { postId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['comments', postId],
    queryFn: () => fetchComments(postId),
  })

  if (isLoading) return <div>Loading comments...</div>
  if (error) return <div>Error loading comments</div>

  return (
    <ul>
      {data.map((comment) => (
        <li key={comment.id}>{comment.text}</li>
      ))}
    </ul>
  )
}
```

### Prefetching on Hover

```tsx
import { Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'

function PostLink({ postId, children }) {
  const queryClient = useQueryClient()

  return (
    <Link
      to="/posts/$id"
      params={{ id: postId }}
      onMouseEnter={() => {
        queryClient.prefetchQuery({
          queryKey: ['post', postId],
          queryFn: () => fetchPost(postId),
        })
      }}
    >
      {children}
    </Link>
  )
}
```

## Mutations

### Basic Mutation

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

function CreatePostForm() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (data: { title: string; content: string }) =>
      fetch('/api/posts', {
        method: 'POST',
        body: JSON.stringify(data),
      }).then((res) => res.json()),
    onSuccess: (newPost) => {
      // Invalidate posts list
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      // Navigate to new post
      navigate({ to: '/posts/$id', params: { id: newPost.id } })
    },
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    mutation.mutate({
      title: formData.get('title') as string,
      content: formData.get('content') as string,
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <input name="title" placeholder="Title" required />
      <textarea name="content" placeholder="Content" required />
      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Creating...' : 'Create Post'}
      </button>
    </form>
  )
}
```

### Optimistic Updates

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query'

function LikeButton({ postId }) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => fetch(`/api/posts/${postId}/like`, { method: 'POST' }),
    onMutate: async () => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['post', postId] })

      // Snapshot previous value
      const previous = queryClient.getQueryData(['post', postId])

      // Optimistically update
      queryClient.setQueryData(['post', postId], (old: any) => ({
        ...old,
        likes: old.likes + 1,
      }))

      return { previous }
    },
    onError: (err, variables, context) => {
      // Rollback on error
      queryClient.setQueryData(['post', postId], context?.previous)
    },
    onSettled: () => {
      // Refetch after mutation
      queryClient.invalidateQueries({ queryKey: ['post', postId] })
    },
  })

  return <button onClick={() => mutation.mutate()}>Like</button>
}
```

## Search Params with Query

### Synced Search State

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'

export const Route = createFileRoute('/posts/')({
  validateSearch: (search) => ({
    page: Number(search.page) || 1,
    filter: (search.filter as string) || '',
  }),
  component: PostsList,
})

function PostsList() {
  const { page, filter } = Route.useSearch()
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['posts', { page, filter }],
    queryFn: () => fetchPosts({ page, filter }),
  })

  const setPage = (newPage: number) => {
    navigate({ search: (prev) => ({ ...prev, page: newPage }) })
  }

  const setFilter = (newFilter: string) => {
    navigate({ search: (prev) => ({ ...prev, filter: newFilter, page: 1 }) })
  }

  return (
    <div>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter..."
      />
      {isLoading ? (
        <div>Loading...</div>
      ) : (
        <ul>
          {data?.posts.map((post) => (
            <li key={post.id}>{post.title}</li>
          ))}
        </ul>
      )}
      <button onClick={() => setPage(page - 1)} disabled={page === 1}>
        Previous
      </button>
      <span>Page {page}</span>
      <button onClick={() => setPage(page + 1)}>Next</button>
    </div>
  )
}
```

## Error Handling

### Error Boundary Integration

```tsx
import { useQueryErrorResetBoundary } from '@tanstack/react-query'
import { ErrorComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$id')({
  loader: async ({ params, context: { queryClient } }) => {
    return queryClient.ensureQueryData({
      queryKey: ['post', params.id],
      queryFn: () => fetchPost(params.id),
    })
  },
  errorComponent: ({ error, reset }) => {
    const { reset: queryReset } = useQueryErrorResetBoundary()

    return (
      <div>
        <h1>Error loading post</h1>
        <p>{error.message}</p>
        <button
          onClick={() => {
            queryReset()
            reset()
          }}
        >
          Try again
        </button>
      </div>
    )
  },
})
```

## DevTools

```tsx
// routes/__root.tsx
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

export const Route = createRootRoute({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <ReactQueryDevtools initialIsOpen={false} />
      <TanStackRouterDevtools />
    </QueryClientProvider>
  ),
})
```
