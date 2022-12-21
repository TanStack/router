---
id: createRoute
title: createRoute
---

```tsx
import { createRoute } from '@tanstack/router-core'

const route = createRoute({
    routeConfig
    options,
    parent,
    router
})
```

**Options**
- `routeConfig: RouteConfig`
    - **Required**
- `options: TRouteInfo['options']`
    - **Required**
- `parent: undefined | Route<TAllRouteInfo, any>`
    - **Required**
- `router: Router<TAllRouteInfo['routeConfig'], TAllRouteInfo, TRouterContext>`
    - **Required**

**Returns**
- `route: Route<TAllRouteInfo, TRouteInfo, TRouterContext>`
