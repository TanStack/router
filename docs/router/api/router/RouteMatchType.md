---
id: RouteMatchType
title: RouteMatch type
---

The `RouteMatch` type represents a route match in TanStack Router.

```tsx
interface RouteMatch {
  id: string
  routeId: string
  fullPath: Route['fullPath']
  index: number
  pathname: string
  params: Route['allParams']
  status: 'pending' | 'success' | 'error' | 'redirected' | 'notFound'
  isFetching: false | 'beforeLoad' | 'loader'
  error: unknown
  paramsError: unknown
  searchError: unknown
  updatedAt: number
  loaderData?: Route['loaderData']
  loaderDeps: Route['loaderDeps']
  context: Route['allContext']
  search: Route['fullSearchSchema']
  staticData: Route['staticData']
  abortController: AbortController
  cause: 'preload' | 'enter' | 'stay'
  ssr?: boolean | 'data-only'
}
```

## RouteMatch properties

The `RouteMatch` type contains the public properties available on each active route match.

### `id` property

- Type: `string`
- A unique identifier for this route match instance.

### `routeId` property

- Type: `string`
- The id of the matched route.

### `fullPath` property

- Type: `Route['fullPath']`
- The matched route's full path, typed to the specific route.

### `index` property

- Type: `number`
- The position of this match within the matched route array, ordered from the root route at `0` to the leaf-most route.

### `pathname` property

- Type: `string`
- The interpolated pathname for this match.

### `params` property

- Type: `Route['allParams']`
- The parsed path params for this match, including params inherited from parent routes.

### `status` property

- Type: `'pending' | 'success' | 'error' | 'redirected' | 'notFound'`
- The current loading and resolution status of the route match.

### `isFetching` property

- Type: `false | 'beforeLoad' | 'loader'`
- Indicates whether the match is currently fetching data, and which lifecycle function is running.

### `error` property

- Type: `unknown`
- The error thrown while loading the route match, if any.

### `paramsError` property

- Type: `unknown`
- The error thrown while validating this route's path params, if any.

### `searchError` property

- Type: `unknown`
- The error thrown while validating this route's search params, if any.

### `updatedAt` property

- Type: `number`
- A timestamp for the last time this match was updated.

### `loaderData` property

- Type: `Route['loaderData']`
- Optional
- The data returned from the route's `loader`, if one exists.

### `loaderDeps` property

- Type: `Route['loaderDeps']`
- The dependency object returned from the route's `loaderDeps` function.

### `context` property

- Type: `Route['allContext']`
- The merged route context for this match, including context from parent routes.

### `search` property

- Type: `Route['fullSearchSchema']`
- The parsed and validated search params for this match, including search params inherited from parent routes.

### `staticData` property

- Type: `Route['staticData']`
- The static data configured on the matched route.

### `abortController` property

- Type: `AbortController`
- An abort controller for this route match. Its signal is aborted when the route is unloaded or when the match becomes outdated.

### `cause` property

- Type: `'preload' | 'enter' | 'stay'`
- Describes why the route match was loaded. `'enter'` means the route was entered, `'stay'` means the route remained active across a navigation, and `'preload'` means the route was preloaded.

### `ssr` property

- Type: `boolean | 'data-only'`
- Optional
- The SSR mode configured for the matched route.
