---
name: File-based routing
description: Directory, flat, and mixed routing patterns and generation flow.
version: 1
source: docs/router/framework/react/routing/file-based-routing.md
---

# File-based routing

## Summary

- File-based routing is the recommended approach for TanStack Router.
- Supports directory routes, flat routes, or a mix of both.
- A bundler plugin or Router CLI generates `routeTree.gen.ts`.

## Patterns

- Directory routes map folders to nested routes.
- Flat routes use `.` separators in file names to express nesting.
- Mixed routing lets you combine directories and flat routes.

## Generation

- Route tree generation runs in dev/build via the plugin or CLI.
- The generated route tree enables type-safe paths and links.

## Use cases

- Organize routes by folder structure
- Split large route trees using flat routing
- Keep routing scalable as the app grows

## Notes

- Requires the bundler plugin or CLI to generate `routeTree.gen.ts`.
- Mixed routing is allowed; choose what fits the directory layout.

## Examples

```txt
src/routes/
  __root.tsx
  index.tsx
  users/
    $userId.tsx
```

```txt
src/routes/
  __root.tsx
  users.$userId.tsx
  users.$userId.settings.tsx
```
