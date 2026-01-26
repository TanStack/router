---
name: Virtual file routes
description: Programmatic route tree configuration via virtual files.
version: 1
source: docs/router/framework/react/routing/virtual-file-routes.md
---

# Virtual file routes

## Summary

- Virtual file routes let you build route trees programmatically.
- Configure via the TanStack Router plugin or `tsr.config.json`.

## Key APIs

- `rootRoute`, `route`, `index`, `layout`, and `physical` helpers.
- `physical` mounts a directory or merges into the current level.
- `__virtual.ts` can export `defineVirtualSubtreeConfig` for a subtree.

## Constraints

- Conflicting route paths throw an error.

## Use cases

- Generate routes from CMS or config
- Mount physical directories into virtual layouts
- Share route definitions across projects

## Notes

- `__virtual.ts` switches a subtree to virtual configuration.
- `physical` can merge or mount under a prefix.

## Examples

```ts
import { rootRoute, route, index } from '@tanstack/virtual-file-routes'

export default rootRoute({
  children: [
    index('routes/index.tsx'),
    route('users', 'routes/users/index.tsx', {
      children: [route('$userId', 'routes/users/$userId.tsx')],
    }),
  ],
})
```
