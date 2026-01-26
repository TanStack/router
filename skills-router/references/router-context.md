---
name: Router context
description: Typed context, beforeLoad context, and dependency injection.
version: 1
source: docs/router/framework/react/guide/router-context.md
---

# Router context

## Summary

- Use `createRootRouteWithContext` for typed context.
- Provide context via `createRouter({ context })`.
- Extend context in `beforeLoad` and merge down the tree.

## Use cases

- Inject services (API clients, feature flags)
- Provide per-request data to loaders
- Build breadcrumbs and titles via matches

## Notes

- Prefer `createRootRouteWithContext` to type context.
- `beforeLoad` can safely extend context per route.

## Examples

```tsx
type RouterContext = { api: ApiClient }

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Root,
})

const router = createRouter({
  routeTree,
  context: { api },
})
```
