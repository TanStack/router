---
id: createReactRouter
title: createReactRouter
---

use the 'createReactRouter' to create a router to provide it to the Router Provider, 'createReactRouter' takes in routes config in the options.

```tsx
import { createReactRouter } from '@tanstack/react-router'

const routeConfig = rootRoute.addChildren([
  indexRoute,
])

const router = createReactRouter({
  routeConfig,
  //add other options here
})
```

**Options**
- `options: RouterOptions<TRouteConfig, TRouterContext>`
  - **Required**

**Returns**
- `router: Router<TRouteConfig, TAllRouteInfo, TRouterContext>`
