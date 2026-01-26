---
name: Code-based routing
description: Manual route tree composition with createRoute APIs.
version: 1
source: docs/router/framework/react/routing/code-based-routing.md
---

# Code-based routing

## Summary

- Code-based routing is supported but not the recommended default.
- Use `createRootRoute` and `createRoute` with `getParentRoute`.
- Build the tree explicitly via `addChildren`.

## Use cases

- Build routes without file-based generation
- Generate routes dynamically in code
- Create route trees for tests or embedded apps

## Notes

- Paths are normalized; index routes use `/`.
- Pathless and layout routes are still supported via IDs.

## Examples

```tsx
import {
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'

const rootRoute = createRootRoute({ component: Root })

const usersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'users',
  component: Users,
})

const userRoute = createRoute({
  getParentRoute: () => usersRoute,
  path: '$userId',
  component: UserDetail,
})

const routeTree = rootRoute.addChildren([usersRoute.addChildren([userRoute])])

export const router = createRouter({ routeTree })
```
