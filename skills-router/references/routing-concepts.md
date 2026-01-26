---
name: Routing concepts
description: Core route types and file conventions in TanStack Router.
version: 1
source: docs/router/framework/react/routing/routing-concepts.md
---

# Routing concepts

## Summary

- File-based routing is preferred and uses `createFileRoute` with auto-generated paths.
- The root route is defined via `__root.tsx` and `createRootRoute`.
- Route types include index, dynamic, splat, layout, and pathless layout routes.

## Key conventions

- Index routes use the `index` token and represent trailing slash paths.
- Dynamic segments use `$param` and map to route params.
- Splat routes use `$` and map to `_splat`.
- Pathless layout routes start with `_` and do not affect the URL.
- Un-nested routes use a trailing `_` to break out to the root.
- Route groups use `(group)` folder names and do not affect the URL.
- `-` prefix excludes files from routing.
- Use `[.]` to escape special characters like `.` in file names.

## Use cases

- Model nested UI with layouts and pathless routes
- Capture resource IDs with dynamic params
- Group routes without changing URLs

## Notes

- Pathless layout routes are identified by IDs, not URL paths.
- Un-nesting uses a trailing `_` to break out of the current tree.

## Examples

```tsx
// src/routes/users.$userId.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/users/$userId')({
  component: UserPage,
})
```

```tsx
// src/routes/_app.tsx (pathless layout)
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_app')({
  component: () => (
    <div className="layout">
      <Outlet />
    </div>
  ),
})
```
