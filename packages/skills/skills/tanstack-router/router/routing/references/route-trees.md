# Route Trees

The route tree defines the hierarchy of routes in your application.

## Structure

Routes form a tree with parent-child relationships:

```
rootRoute
├── indexRoute (/)
├── aboutRoute (/about)
└── postsRoute (/posts)
    ├── postsIndexRoute (/posts)
    └── postRoute (/posts/$postId)
```

## Building the Tree

### File-Based (Auto-Generated)

```tsx
// routeTree.gen.ts is auto-generated
import { routeTree } from './routeTree.gen'

const router = createRouter({ routeTree })
```

### Code-Based (Manual)

```tsx
const routeTree = rootRoute.addChildren([
  indexRoute,
  aboutRoute,
  postsRoute.addChildren([postsIndexRoute, postRoute]),
])
```

## Parent-Child Relationships

Child routes:

- Inherit parent's URL path
- Render inside parent's `<Outlet />`
- Can access parent's loader data via context
- Run after parent's `beforeLoad`

```tsx
// Parent: /posts
const postsRoute = createRoute({
  path: 'posts',
  component: () => (
    <div>
      <h1>Posts</h1>
      <Outlet /> {/* Children render here */}
    </div>
  ),
})

// Child: /posts/123
const postRoute = createRoute({
  getParentRoute: () => postsRoute,
  path: '$postId',
  component: Post,
})
```

## Outlet

The `<Outlet />` component renders child routes:

```tsx
import { Outlet } from '@tanstack/react-router'

function Layout() {
  return (
    <div>
      <header>...</header>
      <main>
        <Outlet /> {/* Child route renders here */}
      </main>
    </div>
  )
}
```

## Route IDs

Each route has a unique ID based on its path:

- `/posts/$postId` → ID: `/posts/$postId`
- Pathless routes use explicit `id`: `/_authenticated`
