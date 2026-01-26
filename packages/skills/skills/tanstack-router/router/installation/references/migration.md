---
name: router-migration
---

# Migration Guide

Migrating to TanStack Router from other routing libraries.

## From React Router

### Key Differences

| React Router        | TanStack Router     |
| ------------------- | ------------------- |
| `useParams()`       | `Route.useParams()` |
| `useSearchParams()` | `Route.useSearch()` |
| `useNavigate()`     | `useNavigate()`     |
| `useLocation()`     | `useLocation()`     |
| `<Link to="...">`   | `<Link to="...">`   |
| `<Outlet />`        | `<Outlet />`        |
| `loader` function   | `loader` function   |

### Route Definition

```tsx
// React Router
const router = createBrowserRouter([
  {
    path: '/',
    element: <Root />,
    children: [
      { path: 'about', element: <About /> },
      { path: 'posts/:id', element: <Post /> },
    ],
  },
])

// TanStack Router (code-based)
const rootRoute = createRootRoute({ component: Root })
const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: About,
})
const postRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/posts/$id', // Note: $ instead of :
  component: Post,
})
const routeTree = rootRoute.addChildren([aboutRoute, postRoute])
const router = createRouter({ routeTree })
```

### Dynamic Params

```tsx
// React Router
const { id } = useParams()

// TanStack Router
const { id } = Route.useParams() // Type-safe!
```

### Search Params

```tsx
// React Router
const [searchParams, setSearchParams] = useSearchParams()
const page = searchParams.get('page')

// TanStack Router (with validation)
const { page } = Route.useSearch() // Type-safe!

// Route definition
export const Route = createFileRoute('/posts/')({
  validateSearch: (search) => ({
    page: Number(search.page) || 1,
  }),
})
```

### Navigation

```tsx
// React Router
navigate('/posts/123')
navigate('/posts', { state: { from: 'home' } })

// TanStack Router
navigate({ to: '/posts/$id', params: { id: '123' } })
navigate({ to: '/posts', state: { from: 'home' } })
```

### Loaders

```tsx
// React Router
export async function loader({ params }) {
  return fetch(`/api/posts/${params.id}`)
}

// TanStack Router
export const Route = createFileRoute('/posts/$id')({
  loader: async ({ params }) => {
    return fetch(`/api/posts/${params.id}`)
  },
})
```

## From React Location

### Key Changes

1. **Package name**: `@tanstack/react-location` → `@tanstack/react-router`
2. **Route definition**: Similar but with enhanced type safety
3. **Search params**: Now validated with schemas

### Route Definition

```tsx
// React Location
const routes = [
  { path: '/', element: <Home /> },
  { path: '/posts/:id', element: <Post /> },
]

// TanStack Router
const rootRoute = createRootRoute()
const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Home,
})
const postRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/posts/$id',
  component: Post,
})
```

### Router Setup

```tsx
// React Location
import { ReactLocation, Router } from '@tanstack/react-location'
const location = new ReactLocation()
<Router location={location} routes={routes} />

// TanStack Router
import { RouterProvider, createRouter } from '@tanstack/react-router'
const router = createRouter({ routeTree })
<RouterProvider router={router} />
```

## Migration Checklist

- [ ] Install `@tanstack/react-router`
- [ ] Set up bundler plugin or CLI
- [ ] Convert route definitions (`:param` → `$param`)
- [ ] Update `useParams()` → `Route.useParams()`
- [ ] Update `useSearchParams()` → `Route.useSearch()`
- [ ] Add type registration for router
- [ ] Add search param validation where needed
- [ ] Test all navigation flows
- [ ] Remove old router package
