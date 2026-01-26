---
name: Outlets
description: Render child routes with Outlet.
version: 1
source: docs/router/framework/react/guide/outlets.md
---

# Outlets

## Summary

- `<Outlet>` renders child routes.
- Routes without components render `<Outlet>` by default.

## Use cases

- Render nested route content
- Compose layout routes
- Build shared UI shells

## Notes

- Place `<Outlet>` anywhere in the component tree.
- Use layout routes to wrap shared structure.

## Examples

```tsx
export const Route = createFileRoute('/dashboard')({
  component: () => (
    <div>
      <Sidebar />
      <Outlet />
    </div>
  ),
})
```
