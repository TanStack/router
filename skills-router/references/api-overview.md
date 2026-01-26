---
name: Router API overview
description: Functions, components, hooks, and types available in Router.
version: 1
source: docs/router/framework/react/api/router.md
---

# Router API overview

## Summary

- Functions: `createRouter`, route creation helpers, and utility helpers like `redirect` and `notFound`.
- Components: `<Link>`, `<Outlet>`, `<Navigate>`, `<Await>`, error/not-found boundaries, and helpers.
- Hooks: navigation, matching, search/params, loader data, and router state hooks.
- Types: route, router, link, navigation, and history-related types.

## Use cases

- Build a router and route tree
- Create links, navigate, and read params/search
- Render pending, error, or not-found boundaries

## Notes

- API surfaces are grouped into functions, components, hooks, and types.
- Start-specific APIs live in `docs/start/**` and are not listed here.

## Examples

```tsx
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
} from '@tanstack/react-router'

const rootRoute = createRootRoute({
  component: () => (
    <div>
      <nav>
        <Link to="/">Home</Link>
      </nav>
      <Outlet />
    </div>
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <h1>Home</h1>,
})

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute]),
})
```
