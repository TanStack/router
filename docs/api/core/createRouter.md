---
id: createRouter
title: createRouter
---

```tsx
import { createRouter } from '@tanstack/router-core'

const router = createRouter({
    history,
    stringifySearch,
    parseSearch,
    filterRoutes,
    defaultPreload,
    defaultPreloadMaxAge,
    defaultPreloadGcMaxAge,
    defaultPreloadDelay,
    defaultComponent,
    defaultErrorComponent,
    defaultPendingComponent,
    defaultLoaderMaxAge,
    defaultLoaderGcMaxAge,
    caseSensitive,
    routeConfig,
    basepath,
    useServerData,
    createRouter,
    createRoute,
    context,
    loadComponent
})
```

**Options**
- `userOptions?: RouterOptions<TRouteConfig, TRouterContext>` - **Optional**
  - `history?: BrowserHistory | MemoryHistory | HashHistory`
  - `stringifySearch?: SearchSerializer`
  - `parseSearch?: SearchParser`
  - `filterRoutes?: FilterRoutesFn`
  - `defaultPreload?: false | 'intent'`
  - `defaultPreloadMaxAge?: number`
  - `defaultPreloadGcMaxAge?: number`
  - `defaultPreloadDelay?: number`
  - `defaultComponent?: GetFrameworkGeneric<'Component'>`
  - `defaultErrorComponent?: GetFrameworkGeneric<'ErrorComponent'>`
  - `defaultPendingComponent?: GetFrameworkGeneric<'Component'>`
  - `defaultLoaderMaxAge?: number`
  - `defaultLoaderGcMaxAge?: number`
  - `caseSensitive?: boolean`
  - `routeConfig?: TRouteConfig`
  - `basepath?: string`
  - `useServerData?: boolean`
  - `createRouter?: (router: Router<any, any, any>) => void`
  - `createRoute?: (opts: {route: AnyRoute, router: Router<any, any, any> }) => void`
  - `context?: TRouterContext`
  - `loadComponent?: (component: GetFrameworkGeneric<'Component'>, ) => Promise<GetFrameworkGeneric<'Component'>>`

**Returns**
- `router: Router<TRouteConfig, TAllRouteInfo, TRouterContext>`
