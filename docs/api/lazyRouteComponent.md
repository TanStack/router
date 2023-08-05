---
id: lazyRouteComponent
title: lazyRouteComponent
---

```tsx
import { lazyRouteComponent } from '@tanstack/router'

export const expensiveRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'expensive',
  component: lazyRouteComponent(() => import('./Expensive')),
})

export const expensiveNamedRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'expensive',
  component: lazyRouteComponent(() => import('./Expensive'), 'Expensive'),
})
```

**Options**

- `importer: () => Promise<T>`
  - **Required**
- `namedImport: key of T = "default"`

**Returns**

- `element: RouteComponent`
