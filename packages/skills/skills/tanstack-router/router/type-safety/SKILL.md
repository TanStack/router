---
name: tanstack-router-type-safety
description: |
  Type safety patterns in TanStack Router.
  Use for type inference, utilities, strict typing, and TypeScript integration.
---

# Type Safety

TanStack Router provides end-to-end type safety for routes, params, search params, and loader data. TypeScript will catch routing errors at compile time.

## Common Patterns

### Router Registration (Required)

Register your router for global type inference:

```tsx
// router.tsx
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export const router = createRouter({ routeTree })

// This declaration enables type-safe navigation everywhere
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```

### Type-Safe Links

```tsx
import { Link } from '@tanstack/react-router'

// ✓ Valid - route exists, params match
<Link to="/posts/$postId" params={{ postId: '123' }}>View Post</Link>

// ✗ Error - route doesn't exist
<Link to="/nonexistent">Bad Link</Link>

// ✗ Error - missing required param
<Link to="/posts/$postId">Missing Param</Link>

// ✗ Error - wrong param type
<Link to="/posts/$postId" params={{ postId: 123 }}>Wrong Type</Link>

// ✓ Valid - search params match schema
<Link to="/posts" search={{ page: 1, filter: 'react' }}>Posts</Link>

// ✗ Error - search param doesn't match schema
<Link to="/posts" search={{ page: 'one' }}>Wrong Search Type</Link>
```

### Type-Safe Programmatic Navigation

```tsx
import { useNavigate } from '@tanstack/react-router'

function MyComponent() {
  const navigate = useNavigate()

  // ✓ Valid
  navigate({ to: '/posts/$postId', params: { postId: '123' } })

  // ✗ Error - missing params
  navigate({ to: '/posts/$postId' })

  // ✓ Valid - from option for relative navigation
  navigate({ to: '..', from: '/posts/$postId' })
}
```

### Extracting Route Types

```tsx
import type { RouteIds, RegisteredRouter } from '@tanstack/react-router'

// Get all valid route IDs
type AllRouteIds = RouteIds<RegisteredRouter['routeTree']>
// "/posts" | "/posts/$postId" | "/about" | ...

// Get params for a specific route
import { Route as PostRoute } from './routes/posts.$postId'
type PostParams = typeof PostRoute.types.params
// { postId: string }

// Get search params for a route
type PostSearch = typeof PostRoute.types.search
// { tab?: string; ... }

// Get loader data type
type PostData = typeof PostRoute.types.loaderData
// { title: string; content: string; ... }
```

### Typed Route Hooks

```tsx
// Inside a route component, hooks are automatically typed
function PostComponent() {
  // Automatically typed from route definition
  const params = Route.useParams() // { postId: string }
  const search = Route.useSearch() // Validated search schema
  const data = Route.useLoaderData() // Loader return type
  const navigate = Route.useNavigate() // Typed for this route
}

// Or use generic hooks with 'from' option
function AnyComponent() {
  const params = useParams({ from: '/posts/$postId' }) // { postId: string }
  const search = useSearch({ from: '/posts' }) // Search schema
}
```

### Typed Router Context

```tsx
import { createRootRouteWithContext } from '@tanstack/react-router'

interface RouterContext {
  auth: {
    user: User | null
    isAuthenticated: boolean
  }
  queryClient: QueryClient
}

// Context is typed in all routes
export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
})

// In child routes
export const Route = createFileRoute('/dashboard')({
  beforeLoad: ({ context }) => {
    // context.auth is typed
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: '/login' })
    }
  },
  loader: ({ context }) => {
    // context.queryClient is typed
    return context.queryClient.ensureQueryData(...)
  },
})
```

### Strict Mode Patterns

```tsx
// Use 'from' to ensure type safety outside route components
const params = useParams({ from: '/posts/$postId' }) // Strict

// Use strict: false when route might not match (loose types)
const params = useParams({ strict: false }) // Partial types

// Select specific fields for better type narrowing
const postId = useParams({
  from: '/posts/$postId',
  select: (p) => p.postId, // string, not { postId: string }
})
```

### Search Param Validation Types

```tsx
import { z } from 'zod'

const searchSchema = z.object({
  page: z.number().catch(1),
  filter: z.string().optional(),
  tags: z.array(z.string()).catch([]),
})

export const Route = createFileRoute('/posts')({
  validateSearch: searchSchema,
  component: PostsComponent,
})

function PostsComponent() {
  // Fully typed from Zod schema
  const { page, filter, tags } = Route.useSearch()
  // page: number
  // filter: string | undefined
  // tags: string[]
}
```

### Generic Components with Route Types

```tsx
import type { LinkProps } from '@tanstack/react-router'

// Type-safe wrapper component
function NavLink<TTo extends string>(
  props: LinkProps<RegisteredRouter, TTo> & { children: React.ReactNode },
) {
  return <Link {...props} activeProps={{ className: 'active' }} />
}

// Usage - fully typed
;<NavLink to="/posts/$postId" params={{ postId: '123' }}>
  View Post
</NavLink>
```

## API Quick Reference

```tsx
// Router registration (required for type safety)
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Type utilities
type RouteIds<TRouteTree> = ...      // All route IDs
type RegisteredRouter = ...           // Your router type

// Extract types from routes
typeof Route.types.params             // Path params type
typeof Route.types.search             // Search params type
typeof Route.types.loaderData         // Loader data type
typeof Route.types.context            // Route context type

// Strict vs loose hooks
useParams({ from: '/route' })         // Strict - must be on this route
useParams({ strict: false })          // Loose - partial types
useSearch({ from: '/route', select }) // Select for narrowed types

// Typed context
createRootRouteWithContext<Context>()
```

## Detailed References

| Reference                   | When to Use                                          |
| --------------------------- | ---------------------------------------------------- |
| `references/inference.md`   | How type inference works, routeTree.gen.ts           |
| `references/utilities.md`   | Type utilities, extracting param types, helper types |
| `references/strict-mode.md` | Strict type checking, avoiding any, type narrowing   |
