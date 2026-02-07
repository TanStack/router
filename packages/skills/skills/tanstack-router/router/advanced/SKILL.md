---
name: tanstack-router-advanced
description: |
  Advanced TanStack Router patterns.
  Use for code splitting, SSR, router context, render optimizations, scroll restoration.
---

# Advanced Patterns

Advanced configuration and optimization patterns for TanStack Router.

## Common Patterns

### Automatic Code Splitting

With file-based routing and `autoCodeSplitting: true` (default), routes are automatically code-split:

```tsx
// vite.config.ts
import { tanstackRouter } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    tanstackRouter({
      autoCodeSplitting: true, // Default, routes lazy-loaded
    }),
  ],
})
```

Each route file becomes its own chunk, loaded on-demand.

### Manual Code Splitting (Code-Based)

For code-based routes, use `lazy`:

```tsx
import { createRoute, lazyRouteComponent } from '@tanstack/react-router'

const PostRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/posts/$postId',
  component: lazyRouteComponent(() => import('./PostComponent')),
  // Or split loader too
  loader: lazyFn(() => import('./postLoader'), 'loader'),
})
```

### Router Context (Dependency Injection)

Pass dependencies through router context for loaders and components:

```tsx
// Define context type
interface RouterContext {
  auth: AuthClient
  queryClient: QueryClient
  api: ApiClient
}

// Create router with context type
const router = createRouter({
  routeTree,
  context: {
    auth: undefined!,
    queryClient: undefined!,
    api: undefined!,
  },
})

// Provide actual values at render
function App() {
  const auth = useAuth()
  return (
    <RouterProvider
      router={router}
      context={{
        auth,
        queryClient,
        api: createApiClient(auth.token),
      }}
    />
  )
}

// Use in routes
export const Route = createFileRoute('/dashboard')({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: '/login' })
    }
  },
  loader: ({ context }) => {
    return context.queryClient.ensureQueryData({
      queryKey: ['dashboard'],
      queryFn: () => context.api.getDashboard(),
    })
  },
})
```

### Typed Router Context

```tsx
// With createRootRouteWithContext
import { createRootRouteWithContext } from '@tanstack/react-router'

interface RouterContext {
  auth: { user: User | null; isAuthenticated: boolean }
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
})
```

### Scroll Restoration

```tsx
const router = createRouter({
  routeTree,
  // Enable scroll restoration
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
})

// Custom scroll behavior per route
export const Route = createFileRoute('/posts')({
  // Disable scroll reset for this route
  resetScroll: false,
})

// Or in navigation
<Link to="/posts" resetScroll={false}>Posts</Link>
navigate({ to: '/posts', resetScroll: false })
```

### Document Head (Title & Meta)

```tsx
import { useHead } from '@tanstack/react-router'

function PostComponent() {
  const post = Route.useLoaderData()

  useHead({
    title: `${post.title} | My Blog`,
    meta: [
      { name: 'description', content: post.excerpt },
      { property: 'og:title', content: post.title },
      { property: 'og:image', content: post.image },
    ],
  })

  return <article>{/* ... */}</article>
}

// Or in route definition
export const Route = createFileRoute('/about')({
  head: () => ({
    title: 'About Us',
    meta: [{ name: 'description', content: 'Learn about our company' }],
  }),
})
```

### Render Optimization (Structural Sharing)

TanStack Router uses structural sharing to minimize re-renders:

```tsx
// Only re-render when specific values change
const page = useSearch({
  from: '/posts',
  select: (search) => search.page,
  structuralSharing: true, // Default
})

// Same for loader data
const title = Route.useLoaderData({
  select: (data) => data.post.title,
})
```

### Router Devtools

```tsx
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      {process.env.NODE_ENV === 'development' && (
        <TanStackRouterDevtools position="bottom-right" />
      )}
    </>
  ),
})
```

### SSR Setup (Without Start)

Basic SSR with streaming:

```tsx
// server.tsx
import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { renderToString } from 'react-dom/server'

export async function render(url: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [url] }),
  })

  await router.load()

  const html = renderToString(<RouterProvider router={router} />)
  return html
}

// client.tsx
import { createBrowserHistory, createRouter } from '@tanstack/react-router'
import { hydrateRoot } from 'react-dom/client'

const router = createRouter({
  routeTree,
  history: createBrowserHistory(),
})

hydrateRoot(document, <RouterProvider router={router} />)
```

### Preload Configuration

```tsx
const router = createRouter({
  routeTree,
  // Global preload settings
  defaultPreload: 'intent', // 'intent' | 'render' | 'viewport' | false
  defaultPreloadDelay: 50, // ms before preload starts
  defaultPreloadStaleTime: 30000, // 30s before re-preload
})

// Per-route override
export const Route = createFileRoute('/heavy-page')({
  // Don't preload this heavy route
  preload: false,
})
```

## API Quick Reference

```tsx
// Router options
createRouter({
  routeTree,
  context: RouterContext,
  scrollRestoration: boolean,
  defaultPreload: 'intent' | 'render' | 'viewport' | false,
  defaultPreloadDelay: number,
  defaultPreloadStaleTime: number,
})

// Code splitting
lazyRouteComponent(() => import('./Component'))
lazyFn(() => import('./loader'), 'loaderFn')

// Document head
useHead({ title, meta, links, scripts })

// Devtools
<TanStackRouterDevtools position="bottom-right" initialIsOpen={false} />

// Structural sharing (select)
useSearch({ select: (s) => s.page, structuralSharing: true })
useLoaderData({ select: (d) => d.title })
```

## Detailed References

| Reference                           | When to Use                                              |
| ----------------------------------- | -------------------------------------------------------- |
| `references/code-splitting.md`      | Lazy loading, chunk naming, preloading strategies        |
| `references/ssr-basics.md`          | Basic SSR setup (without Start), hydration               |
| `references/router-context.md`      | Dependency injection, typing context, nested context     |
| `references/render-optimization.md` | Structural sharing, fine-grained updates, performance    |
| `references/scroll-restoration.md`  | Scroll behavior, custom scroll handling, hash navigation |
| `references/document-head.md`       | Title, meta tags, useHead hook                           |
| `references/devtools.md`            | Router devtools setup, debugging                         |
| `references/i18n.md`                | Internationalization patterns                            |
