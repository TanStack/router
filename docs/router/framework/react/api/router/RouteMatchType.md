---
id: RouteMatchType
title: RouteMatch type
---

The `RouteMatch` type represents a route match in TanStack Router.

```tsx
interface RouteMatch {
  id: string
  routeId: TRouteId
  fullPath: TFullPath
  index: number
  pathname: string
  params: TAllParams
  status: 'pending' | 'success' | 'error' | 'redirected' | 'notFound'
  isFetching: false | 'beforeLoad' | 'loader'
  error: unknown
  paramsError: unknown
  searchError: unknown
  updatedAt: number
  loadPromise?: Promise<void>
  beforeLoadPromise?: Promise<void>
  loaderPromise?: Promise<void>
  loaderData?: TLoaderData
  context: TAllContext
  search: TFullSearchSchema
  fetchCount: number
  abortController: AbortController
  cause: 'preload' | 'enter' | 'stay'
  loaderDeps: TLoaderDeps
  preload: boolean
  invalid: boolean
  headers?: Record<string, string>
  globalNotFound?: boolean
  staticData: StaticDataRouteOption
  minPendingPromise?: Promise<void>
  pendingTimeout?: ReturnType<typeof setTimeout>
  ssr?: boolean | 'data-only'
  displayPendingPromise?: Promise<void>
  scripts?: unknown
  links?: unknown
  headScripts?: unknown
  meta?: unknown
  styles?: unknown
}
```
