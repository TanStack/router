---
name: Route trees
description: How route trees are formed and configured.
version: 1
source: docs/router/framework/react/routing/route-trees.md
---

# Route trees

## Summary

- The route tree maps URL structure to route components.
- File-based, virtual file, and code-based routing all produce a route tree.
- Configuration can be directory, flat, mixed, or virtual.

## Use cases

- Explain how the route hierarchy is built
- Decide between file-based and code-based routing
- Validate tree composition and nesting

## Notes

- Route trees are used for matching, preloading, and data loading.
- Virtual file routes still produce a concrete tree at build time.

## Examples

```tsx
// File-based route tree import
import { routeTree } from './routeTree.gen'
import { createRouter } from '@tanstack/react-router'

export const router = createRouter({ routeTree })
```
