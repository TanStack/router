---
name: Type safety
description: Router type registration and TS tips.
version: 1
source: docs/router/framework/react/guide/type-safety.md
---

# Type safety

## Summary

- Register router types via module augmentation.
- Use `createRootRouteWithContext` for typed context.
- Use `strict: false` in shared components when needed.

## Use cases

- Enable strong types for `useNavigate`, `useSearch`, and `Link`
- Share components across multiple router instances
- Type router context for loaders and hooks

## Notes

- Module augmentation registers the router instance globally.
- Use `strict: false` when the route type is unknown.

## Examples

```ts
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```
