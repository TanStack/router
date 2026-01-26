---
name: Start routing
description: File-based routing, root route, and route tree generation in Start.
version: 1
source: docs/start/framework/react/guide/routing.md
---

# Start routing

## Summary

- Start uses TanStack Router for file-based routing.
- Routes live in `src/routes`, and `__root.tsx` defines the root route.
- `routeTree.gen.ts` is generated during dev and build.

## Root route essentials

- Render `HeadContent` inside `<head>`.
- Render `Scripts` inside `<body>`.
- Use `<Outlet />` to render child routes.

## Route types

- Index routes, dynamic routes (`$param`), and splat routes (`$`).
- Pathless layout routes (`_`) and un-nested routes (trailing `_`).

## Use cases

- Set up initial Start routing and root layout
- Configure file-based routes for pages and layouts
- Ensure root document shell is correct

## Notes

- `routeTree.gen.ts` is generated during dev/build.
- `HeadContent` and `Scripts` are required in the root document.

## Examples

```tsx
// src/routes/__root.tsx
export const Route = createRootRoute({
  component: () => (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
})
```
