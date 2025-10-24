---
id: error-boundaries
$title: Error Boundaries
---

## Error Boundaries (Solid Start)

TanStack Start (Solid) uses TanStack Router's route-level error boundaries.

- Set a default for all routes via the router
- Override per-route with `errorComponent`

### Configure a default

```tsx
// src/router.tsx
import { createRouter, ErrorComponent } from '@tanstack/solid-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const router = createRouter({
    routeTree,
    defaultErrorComponent: ({ error, reset }) => (
      <ErrorComponent error={error} />
    ),
  })
  return router
}
```

### Per-route override

```tsx
// src/routes/posts.$postId.tsx
import { createFileRoute, ErrorComponent } from '@tanstack/solid-router'
import type { ErrorComponentProps } from '@tanstack/solid-router'

function PostError(props: ErrorComponentProps) {
  return <ErrorComponent error={props.error} />
}

export const Route = createFileRoute('/posts/$postId')({
  component: PostComponent,
  errorComponent: PostError,
})
```

Notes:

- `ErrorComponent` is a simple built-in UI you can replace.
- Call `reset()` to retry rendering the route after fixing state.
- Use `beforeLoad`/`loader` to throw errors that will be caught.
