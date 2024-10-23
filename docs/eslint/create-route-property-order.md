---
id: create-route-property-order
title: Ensure correct order of inference sensitive properties for createRoute functions
---

For the following functions, the property order of the passed in object matters due to type inference:

- `createRoute`
- `createFileRoute`
- `createRootRoute`
- `createRootRouteWithContext`

The correct property order is as follows

- `params`, `validateSearch`
- `loaderDeps`, `search.middlewares`
- `context`
- `beforeLoad`
- `loader`
- `onEnter`, `onStay`, `onLeave`, `meta`, `links`, `scripts`, `headers`

All other properties are insensitive to the order as they do not depend on type inference.

## Rule Details

Examples of **incorrect** code for this rule:

```tsx
/* eslint "@tanstack/router/create-route-property-order": "warn" */
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/foo/bar/$id')({
  loader: async ({context}) => {
    await context.queryClient.ensureQueryData(getQueryOptions(context.hello)),
  },
  beforeLoad: () => ({hello: 'world'})
})
```

Examples of **correct** code for this rule:

```tsx
/* eslint "@tanstack/router/create-route-property-order": "warn" */
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/foo/bar/$id')({
  beforeLoad: () => ({hello: 'world'}),
  loader: async ({context}) => {
    await context.queryClient.ensureQueryData(getQueryOptions(context.hello)),
  }
})
```

## Attributes

- [x] ✅ Recommended
- [x] 🔧 Fixable
