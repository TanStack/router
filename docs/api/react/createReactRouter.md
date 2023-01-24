---
id: ReactRouter
title: ReactRouter
---

use the 'ReactRouter' to create a router to provide it to the Router Provider, 'ReactRouter' takes in routes config in the options.

```tsx
import { ReactRouter } from '@tanstack/react-router'

const routeConfig = rootRoute.addChildren([indexRoute])

const router = new ReactRouter({
  routeConfig,
  //add other options here
})
```

**Options**

- `options: RouterOptions<TRouteConfig, TRouterContext>`
  - **Required**

**Returns**

- `router: Router<TRouteConfig, TRoutesInfo, TRouterContext>`
