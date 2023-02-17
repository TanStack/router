---
id: Router
title: Router
---

use the 'Router' to create a router to provide it to the Router Provider, 'Router' takes in routes config in the options.

```tsx
import { Router } from '@tanstack/router'

const routeConfig = rootRoute.addChildren([indexRoute])

const router = new Router({
  routeConfig,
  //add other options here
})
```

**Options**

- `options: RouterOptions<TRouteConfig, TRouterContext>`
  - **Required**

**Returns**

- `router: Router<TRouteConfig, TRoutesInfo, TRouterContext>`
