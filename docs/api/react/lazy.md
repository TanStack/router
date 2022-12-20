---
id: lazy
title: lazy
---

```tsx
import { lazy } from '@tanstack/react-router'

export const expensiveRoute = rootRoute.createRoute({
  path: 'expensive',
  component: lazy(() => import('./Expensive')),
})
```

**Options**
- `importer: () => Promise<{ default: SyncRouteComponent }>`
  - **Required**

**Returns**
- `element: RouteComponent`
