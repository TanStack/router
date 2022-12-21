---
id: createRouteMatch
title: createRouteMatch
---

```tsx
import { createRouteMatch } from '@tanstack/router-core'

const match = createRouteMatch(router, route, options)

```

**Options**
- `router: Router<any, any, any>`
  - **Optional**
- `options` - **Optional**
  - `route: Route<TAllRouteInfo, TRouteInfo>`
  - `parentMatch?: RouteMatch<any, any>`
  - `params: TRouteInfo['allParams']`
  - `pathname: string`


**Returns**
- `match: RouteMatch<TAllRouteInfo, TRouteInfo>`
