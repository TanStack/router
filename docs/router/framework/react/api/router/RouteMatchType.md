---
id: RouteMatchType
title: RouteMatch type
---

The `RouteMatch` type represents a route match in TanStack Router.

```tsx
interface RouteMatch {
  id: string
  routeId: string
  fullPath: string
  index: number
  pathname: string
  params: Route['allParams']
  status: 'pending' | 'success' | 'error' | 'redirected' | 'notFound'
  isFetching: false | 'beforeLoad' | 'loader'
  showPending: boolean
  error: unknown
  paramsError: unknown
  searchError: unknown
  updatedAt: number
  loadPromise?: Promise<void>
  loaderData?: Route['loaderData']
  context: Route['allContext']
  search: Route['fullSearchSchema']
  fetchedAt: number
  abortController: AbortController
  cause: 'preload' | 'enter' | 'stay'
  fetchCount: number
  preload: boolean
  invalid: boolean
  headers?: Record<string, string>
  globalNotFound?: boolean
  ssr?: boolean | 'data-only'
  displayPendingPromise?: Promise<void>
}
```
