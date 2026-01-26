# Type Inference

How TanStack Router infers and propagates types.

## Route Registration

Register your router for global type inference:

```tsx
// router.tsx
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export const router = createRouter({ routeTree })

// Register router type globally
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```

## Generated Route Tree

File-based routing generates `routeTree.gen.ts`:

```tsx
// routeTree.gen.ts (auto-generated)
import { Route as rootRoute } from './routes/__root'
import { Route as indexRoute } from './routes/index'
import { Route as postsRoute } from './routes/posts'
import { Route as postsIdRoute } from './routes/posts.$postId'

export const routeTree = rootRoute.addChildren([
  indexRoute,
  postsRoute.addChildren([postsIdRoute]),
])
```

## Type Flow

Types flow through the route tree:

```
Route Definition → Route Tree → Router → Components
     ↓                                      ↓
  params, search, loader data → Type-safe hooks
```

## Typed Hooks

```tsx
function PostComponent() {
  // All typed based on route definition
  const params = Route.useParams() // { postId: string }
  const search = Route.useSearch() // { page: number }
  const data = Route.useLoaderData() // { post: Post }
  const context = Route.useRouteContext() // RouterContext
}
```

## Cross-Route Types

Navigate to any route with type checking:

```tsx
// TypeScript knows all valid routes
<Link to="/posts/$postId" params={{ postId: '123' }}>Post</Link>

// Error: Route doesn't exist
<Link to="/invalid">Invalid</Link>

// Error: Missing required param
<Link to="/posts/$postId">Missing param</Link>
```

## Strict Mode

Enable strict type checking:

```tsx
const router = createRouter({
  routeTree,
  strictMode: true, // Error on type mismatches
})
```
