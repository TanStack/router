---
name: tanstack-router-auth-errors
description: |
  Authentication and error handling patterns in TanStack Router.
  Use for protected routes, redirects, not-found handling, and error boundaries.
---

# Auth & Errors

TanStack Router provides patterns for authentication, authorization, and comprehensive error handling through `beforeLoad`, `redirect`, `notFound`, and error components.

## Common Patterns

### Protected Routes with beforeLoad

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard')({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: '/login',
        search: { redirect: '/dashboard' }, // Return URL after login
      })
    }
  },
  component: DashboardComponent,
})
```

### Layout-Based Auth (Protect Multiple Routes)

```tsx
// routes/_authenticated.tsx (pathless layout)
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
  },
})

// routes/_authenticated/dashboard.tsx - automatically protected
// routes/_authenticated/settings.tsx - automatically protected
// routes/_authenticated/profile.tsx - automatically protected
```

### Role-Based Access Control

```tsx
export const Route = createFileRoute('/admin')({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: '/login' })
    }

    if (context.auth.user.role !== 'admin') {
      throw redirect({
        to: '/unauthorized',
        search: { required: 'admin' },
      })
    }
  },
})

// Or check specific permissions
export const Route = createFileRoute('/posts/create')({
  beforeLoad: ({ context }) => {
    if (!context.auth.user?.permissions.includes('posts:create')) {
      throw redirect({ to: '/unauthorized' })
    }
  },
})
```

### Redirect After Login

```tsx
// Login page - handle redirect param
export const Route = createFileRoute('/login')({
  validateSearch: (search) => ({
    redirect: (search.redirect as string) || '/',
  }),
  component: LoginPage,
})

function LoginPage() {
  const { redirect: redirectTo } = Route.useSearch()
  const navigate = useNavigate()

  const handleLogin = async (credentials) => {
    await auth.login(credentials)
    navigate({ to: redirectTo })
  }
}
```

### Not Found Handling

```tsx
import { createFileRoute, notFound } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    const post = await fetchPost(params.postId)

    if (!post) {
      throw notFound()
    }

    return post
  },
  component: PostComponent,
  notFoundComponent: () => (
    <div>
      <h1>Post Not Found</h1>
      <p>The post you're looking for doesn't exist.</p>
      <Link to="/posts">Back to Posts</Link>
    </div>
  ),
})
```

### Global Not Found (404 Page)

```tsx
// routes/__root.tsx
export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: () => (
    <div>
      <h1>404 - Page Not Found</h1>
      <Link to="/">Go Home</Link>
    </div>
  ),
})
```

### Error Boundaries

```tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    const response = await fetch(`/api/posts/${params.postId}`)
    if (!response.ok) {
      throw new Error(`Failed to load post: ${response.statusText}`)
    }
    return response.json()
  },
  component: PostComponent,
  errorComponent: ({ error, reset }) => (
    <div>
      <h1>Something went wrong</h1>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  ),
})
```

### Global Error Handler

```tsx
// routes/__root.tsx
export const Route = createRootRoute({
  component: RootComponent,
  errorComponent: ({ error, reset }) => (
    <div className="error-page">
      <h1>Application Error</h1>
      <pre>{error.message}</pre>
      <button onClick={reset}>Reload</button>
      <Link to="/">Go Home</Link>
    </div>
  ),
})
```

### Pending/Loading States

```tsx
export const Route = createFileRoute('/posts')({
  loader: async () => {
    await new Promise((r) => setTimeout(r, 1000)) // Simulate slow load
    return fetchPosts()
  },
  pendingComponent: () => (
    <div className="loading">
      <Spinner />
      <p>Loading posts...</p>
    </div>
  ),
  // Minimum time to show pending state (prevents flash)
  pendingMinMs: 200,
  // Time before showing pending state
  pendingMs: 100,
})
```

### Combining Auth Context

```tsx
// Set up auth context in router
const router = createRouter({
  routeTree,
  context: {
    auth: undefined!, // Will be provided by AuthProvider
  },
})

// Provide auth context
function App() {
  const auth = useAuth() // Your auth hook
  return <RouterProvider router={router} context={{ auth }} />
}

// Type the context
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

interface RouterContext {
  auth: {
    isAuthenticated: boolean
    user: User | null
    permissions: string[]
  }
}
```

### Handling API Errors in Loader

```tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    try {
      const post = await fetchPost(params.postId)
      if (!post) throw notFound()
      return post
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw notFound()
      }
      if (error instanceof UnauthorizedError) {
        throw redirect({ to: '/login' })
      }
      throw error // Re-throw for errorComponent
    }
  },
})
```

## API Quick Reference

```tsx
// Redirect (throws, never returns)
throw redirect({
  to: string,                    // Target route
  params?: object,               // Path params
  search?: object,               // Search params
  hash?: string,
  replace?: boolean,             // Replace history
  statusCode?: 301 | 302 | 307 | 308,  // For SSR
})

// Not Found (throws, never returns)
throw notFound({
  data?: any,                    // Pass to notFoundComponent
  routeId?: string,              // Target route for not found
})

// Route error/loading options
interface RouteOptions {
  beforeLoad?: (ctx) => void | Promise<void>
  errorComponent?: (props: { error: Error; reset: () => void }) => JSX.Element
  notFoundComponent?: (props: { data?: any }) => JSX.Element
  pendingComponent?: () => JSX.Element
  pendingMs?: number            // Delay before showing pending (default: 1000)
  pendingMinMs?: number         // Min time to show pending (default: 500)
}

// Error boundary wrapper
<CatchBoundary
  getResetKey={() => key}
  onCatch={(error) => logError(error)}
  errorComponent={ErrorComponent}
>
  {children}
</CatchBoundary>

// Not found boundary
<CatchNotFound fallback={<NotFound />}>
  {children}
</CatchNotFound>
```

## Detailed References

| Reference                        | When to Use                                        |
| -------------------------------- | -------------------------------------------------- |
| `references/authentication.md`   | Auth patterns, context setup, session handling     |
| `references/redirects.md`        | Redirect patterns, status codes, return URLs       |
| `references/not-found.md`        | notFound(), notFoundComponent, 404 handling        |
| `references/error-boundaries.md` | Error components, CatchBoundary, recovery patterns |
