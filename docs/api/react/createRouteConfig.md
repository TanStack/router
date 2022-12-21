---
id: createRouteConfig
title: createRouteConfig
---

Use the 'createRouteConfig' to create route config to pass to your Route Provider.
```tsx
import { createRouteConfig } from '@tanstack/react-router'

const router = createRouteConfig()
```

**Options**
- `options: RouterOptions<TRouteConfig, TRouterContext>`
    - **Required**

    - `action: ActionFn<>`
    - `beforeLoad:`
    - `caseSensitive: boolean`
    - `component: RouteComponent<{}>`
    - `errorComponent:RouteComponent<{error, info}>`
    - `loader: LoaderFn<AnyLoaderData, {}, {}>`
    - `loaderGcMaxAge: number`
    - `loaderMaxAge: number`
    - `meta: RouteMeta`
    - `onLoadError: ((err: any) => void) |          undefined`
    - `onLoaded: ((matchContext: {params: {},
        search: {}}) => void | ((match: {params: {};
        search: {};
        }) => void) | undefined) | undefined `
    
    - `onTransition: ((match: {
        params: {};
        search: {};
        }) => void) | undefined `

    - `parseParams: ((rawParams: Record<never, string>) => Record<never, string>) | undefined`
   
    - `path:`
   
    - `pendingCompnent: RouteComponenet<{}>`
   
    - `postSearchFilters:SearchFilter<{}, {}>[]`
   
    - `preSearchFilters:SearchFilter<{}, {}>[]`
   
    - `stringifyParams:((params: Record<never, string>) => Record<never, string>) | undefined`
   
    - `validateSearch:SearchSchemaValidator<AnySearchSchema, {}> | undefined`

**Returns**
- `router: Router<TRouteConfig, TAllRouteInfo, TRouterContext>`
