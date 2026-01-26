---
name: react-query-start-integration
---

# React Query Integration with Start

Using TanStack Query with TanStack Start server functions.

## Installation

```bash
npm install @tanstack/react-query
```

## Provider Setup

```tsx
// routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

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
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  ),
})
```

## Server Functions with React Query

### Basic Pattern

```tsx
// Server function
import { createServerFn } from '@tanstack/react-start'

export const getPosts = createServerFn().handler(async () => {
  return db.query.posts.findMany()
})

export const getPost = createServerFn()
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    return db.query.posts.findFirst({
      where: eq(posts.id, data.id),
    })
  })
```

```tsx
// Component
import { useQuery } from '@tanstack/react-query'
import { getPosts, getPost } from '../server/posts'

function PostList() {
  const { data: posts, isLoading } = useQuery({
    queryKey: ['posts'],
    queryFn: () => getPosts(),
  })

  if (isLoading) return <div>Loading...</div>

  return (
    <ul>
      {posts?.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}

function PostDetail({ id }: { id: string }) {
  const { data: post } = useQuery({
    queryKey: ['post', id],
    queryFn: () => getPost({ id }),
  })

  return <article>{post?.title}</article>
}
```

## Router Context Integration

### Setup

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

## Prefetching in Loaders

### With ensureQueryData

```tsx
// routes/posts.$id.tsx
import { createFileRoute } from '@tanstack/react-router'
import { getPost } from '../server/posts'

export const Route = createFileRoute('/posts/$id')({
  loader: async ({ params, context: { queryClient } }) => {
    return queryClient.ensureQueryData({
      queryKey: ['post', params.id],
      queryFn: () => getPost({ id: params.id }),
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

### Parallel Prefetching

```tsx
// routes/dashboard.tsx
export const Route = createFileRoute('/dashboard')({
  loader: async ({ context: { queryClient } }) => {
    await Promise.all([
      queryClient.ensureQueryData({
        queryKey: ['user'],
        queryFn: () => getCurrentUser(),
      }),
      queryClient.ensureQueryData({
        queryKey: ['notifications'],
        queryFn: () => getNotifications(),
      }),
      queryClient.ensureQueryData({
        queryKey: ['stats'],
        queryFn: () => getDashboardStats(),
      }),
    ])
  },
})
```

## Mutations with Server Functions

### Basic Mutation

```tsx
// Server function
export const createPost = createServerFn({ method: 'POST' })
  .inputValidator((data: { title: string; content: string }) => data)
  .handler(async ({ data }) => {
    return db.insert(posts).values(data).returning()
  })
```

```tsx
// Component
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createPost } from '../server/posts'

function CreatePostForm() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: createPost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] })
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
function LikeButton({ postId }: { postId: string }) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => likePost({ id: postId }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['post', postId] })

      const previous = queryClient.getQueryData(['post', postId])

      queryClient.setQueryData(['post', postId], (old: any) => ({
        ...old,
        likes: old.likes + 1,
      }))

      return { previous }
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['post', postId], context?.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['post', postId] })
    },
  })

  return <button onClick={() => mutation.mutate()}>Like</button>
}
```

## Search Params with React Query

```tsx
// routes/posts.tsx
import { createFileRoute } from '@tanstack/react-router'
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
  const navigate = Route.useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['posts', { page, filter }],
    queryFn: () => getPosts({ page, filter }),
  })

  return (
    <div>
      <input
        value={filter}
        onChange={(e) =>
          navigate({
            search: (prev) => ({ ...prev, filter: e.target.value, page: 1 }),
          })
        }
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

      <button
        onClick={() =>
          navigate({ search: (prev) => ({ ...prev, page: page - 1 }) })
        }
        disabled={page === 1}
      >
        Previous
      </button>
      <span>Page {page}</span>
      <button
        onClick={() =>
          navigate({ search: (prev) => ({ ...prev, page: page + 1 }) })
        }
      >
        Next
      </button>
    </div>
  )
}
```

## Infinite Queries

```tsx
import { useInfiniteQuery } from '@tanstack/react-query'

export const getInfinitePosts = createServerFn()
  .inputValidator((data: { cursor?: string; limit?: number }) => data)
  .handler(async ({ data }) => {
    const limit = data.limit || 10
    const posts = await db.query.posts.findMany({
      limit: limit + 1,
      cursor: data.cursor ? { id: data.cursor } : undefined,
      orderBy: desc(posts.createdAt),
    })

    const hasMore = posts.length > limit
    if (hasMore) posts.pop()

    return {
      posts,
      nextCursor: hasMore ? posts[posts.length - 1].id : undefined,
    }
  })

function InfinitePostList() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['posts', 'infinite'],
      queryFn: ({ pageParam }) => getInfinitePosts({ cursor: pageParam }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    })

  return (
    <div>
      {data?.pages.map((page, i) => (
        <div key={i}>
          {page.posts.map((post) => (
            <div key={post.id}>{post.title}</div>
          ))}
        </div>
      ))}

      <button
        onClick={() => fetchNextPage()}
        disabled={!hasNextPage || isFetchingNextPage}
      >
        {isFetchingNextPage
          ? 'Loading...'
          : hasNextPage
            ? 'Load More'
            : 'No more posts'}
      </button>
    </div>
  )
}
```

## SSR Hydration

### Server-Side Prefetch

```tsx
// routes/posts.tsx
export const Route = createFileRoute('/posts/')({
  loader: async ({ context: { queryClient } }) => {
    await queryClient.prefetchQuery({
      queryKey: ['posts'],
      queryFn: () => getPosts(),
    })
  },
  component: PostsList,
})
```

### Dehydrate/Hydrate

```tsx
// For full SSR hydration
import { dehydrate, HydrationBoundary } from '@tanstack/react-query'

export const Route = createFileRoute('/posts/')({
  loader: async ({ context: { queryClient } }) => {
    await queryClient.prefetchQuery({
      queryKey: ['posts'],
      queryFn: () => getPosts(),
    })

    return { dehydratedState: dehydrate(queryClient) }
  },
  component: PostsPage,
})

function PostsPage() {
  const { dehydratedState } = Route.useLoaderData()

  return (
    <HydrationBoundary state={dehydratedState}>
      <PostsList />
    </HydrationBoundary>
  )
}
```

## Error Handling

```tsx
import { useQueryErrorResetBoundary } from '@tanstack/react-query'

export const Route = createFileRoute('/posts/$id')({
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
