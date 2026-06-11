# Route Matching

How TanStack Router matches URLs to routes.

## Matching Rules

Routes are matched by specificity:

1. **Static segments** beat dynamic: `/posts/new` beats `/posts/$id`
2. **More segments** beat fewer: `/posts/$id/edit` beats `/posts/$id`
3. **Dynamic params** beat splats: `/files/$name` beats `/files/$`
4. **Earlier siblings** beat later (in route tree order)

## Match Examples

Given routes:

- `/posts`
- `/posts/new`
- `/posts/$postId`
- `/posts/$postId/edit`

| URL               | Matched Route         |
| ----------------- | --------------------- |
| `/posts`          | `/posts`              |
| `/posts/new`      | `/posts/new`          |
| `/posts/123`      | `/posts/$postId`      |
| `/posts/123/edit` | `/posts/$postId/edit` |

## Partial Matching

Parent routes match even when children are the final match:

URL `/posts/123` matches:

1. Root route
2. `/posts` (parent)
3. `/posts/$postId` (final)

All three routes render (nested via `<Outlet />`).

## useMatch Hook

Check if a route matches:

```tsx
import { useMatch } from '@tanstack/react-router'

function Component() {
  const match = useMatch({ from: '/posts/$postId', shouldThrow: false })

  if (match) {
    // Route is active, access match.params
  }
}
```

## useMatches Hook

Get all matched routes:

```tsx
import { useMatches } from '@tanstack/react-router'

function Breadcrumbs() {
  const matches = useMatches()

  return (
    <nav>
      {matches.map((match) => (
        <Link key={match.id} to={match.fullPath}>
          {match.routeId}
        </Link>
      ))}
    </nav>
  )
}
```

## Not Found Handling

When no route matches:

```tsx
const router = createRouter({
  routeTree,
  notFoundRoute: createRoute({
    id: 'notFound',
    component: NotFoundPage,
  }),
})
```
