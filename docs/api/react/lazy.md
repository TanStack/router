---
id: lazy
title: lazy
---

```tsx
import { lazy } from '@tanstack/router'

export const expensiveRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'expensive',
  component: lazy(() => import('./Expensive')),
})

export const expensiveNamedRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'expensive',
  component: lazy(() => import('./Expensive'), "Expensive"),
})
```

**Options**

- `importer: () => Promise<T>`
  - **Required**
- `namedImport: key of T = "default"`

**Returns**

- `element: RouteComponent`
