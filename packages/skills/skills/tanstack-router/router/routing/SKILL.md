---
name: tanstack-router-routing
description: |
  Route definition patterns in TanStack Router.
  Use for file-based routing, code-based routing, route trees, matching, and path params.
---

# Routing

TanStack Router supports both file-based and code-based route definitions. File-based routing auto-generates the route tree from your file structure.

## Common Patterns

### File-Based Route Definition

The most common approach. Create files in `src/routes/` and the route tree is auto-generated:

```tsx
// src/routes/posts.$postId.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => fetchPost(params.postId),
  component: PostComponent,
})

function PostComponent() {
  const post = Route.useLoaderData()
  return <article>{post.title}</article>
}
```

**File naming conventions:**

- `index.tsx` → `/` (index route)
- `about.tsx` → `/about`
- `posts.$postId.tsx` → `/posts/:postId` (dynamic param)
- `files.$.tsx` → `/files/*` (catch-all/splat)
- `_layout.tsx` → Pathless layout wrapper
- `(group)/` → Route group (no URL segment)

### Root Route Setup

Every app needs a root route that wraps all others:

```tsx
// src/routes/__root.tsx
import { createRootRoute, Outlet, Link } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/posts">Posts</Link>
      </nav>
      <main>
        <Outlet /> {/* Child routes render here */}
      </main>
    </>
  ),
})
```

### Dynamic Path Parameters

Use `$` prefix for dynamic segments:

```tsx
// Route: /users/$userId/posts/$postId
// URL: /users/123/posts/456
// Params: { userId: '123', postId: '456' }

export const Route = createFileRoute('/users/$userId/posts/$postId')({
  component: () => {
    const { userId, postId } = Route.useParams()
    return (
      <div>
        User {userId}, Post {postId}
      </div>
    )
  },
})
```

### Nested Routes with Layouts

Create shared layouts using pathless routes:

```tsx
// src/routes/_authenticated.tsx (note the underscore - pathless)
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: '/login' })
    }
  },
  component: () => (
    <div className="authenticated-layout">
      <Sidebar />
      <Outlet />
    </div>
  ),
})

// src/routes/_authenticated/dashboard.tsx
// URL: /dashboard (not /_authenticated/dashboard)
export const Route = createFileRoute('/_authenticated/dashboard')({
  component: Dashboard,
})
```

### Code-Based Routes (Alternative)

For full programmatic control without file-based routing:

```tsx
import {
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'

const rootRoute = createRootRoute({
  component: RootComponent,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Home,
})

const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/posts',
  component: Posts,
})

const postRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: '$postId',
  component: Post,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  postsRoute.addChildren([postRoute]),
])

const router = createRouter({ routeTree })
```

## API Quick Reference

```tsx
// File-based route creation
createFileRoute(path)(options)

// Code-based route creation
createRoute({ getParentRoute, path, ...options })
createRootRoute(options)

// Route options
interface RouteOptions {
  component?: React.ComponentType
  loader?: (ctx: LoaderContext) => Promise<Data> | Data
  beforeLoad?: (ctx: BeforeLoadContext) => void | Promise<void>
  validateSearch?: (search: unknown) => ValidatedSearch
  errorComponent?: React.ComponentType<{ error: Error }>
  pendingComponent?: React.ComponentType
  notFoundComponent?: React.ComponentType
}

// Hooks (use inside route components)
Route.useParams() // Get path parameters
Route.useSearch() // Get search parameters
Route.useLoaderData() // Get loader data
Route.useNavigate() // Get navigate function
```

## Detailed References

| Reference                       | When to Use                                                    |
| ------------------------------- | -------------------------------------------------------------- |
| `references/file-based.md`      | File naming conventions, directory structure, route generation |
| `references/code-based.md`      | Manual route definitions, createRoute, createRootRoute         |
| `references/route-trees.md`     | Route tree structure, nesting, parent-child relationships      |
| `references/path-params.md`     | Dynamic segments ($param), wildcards ($), optional segments    |
| `references/route-matching.md`  | How routes match URLs, specificity, ranking                    |
| `references/layouts.md`         | Pathless layouts (\_layout), route groups, shared UI           |
| `references/virtual-routes.md`  | Virtual file routes for programmatic route generation          |
| `references/outlets.md`         | Outlet component, nested rendering                             |
| `references/parallel-routes.md` | Parallel route rendering                                       |
| `references/static-data.md`     | Static route data, meta information                            |
