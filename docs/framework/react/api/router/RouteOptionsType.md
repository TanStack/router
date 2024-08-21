---
id: RouteOptionsType
title: RouteOptions type
---

The `RouteOptions` type is used to describe the options that can be used when creating a route.

## RouteOptions properties

The `RouteOptions` type accepts an object with the following properties:

### `getParentRoute` method

- Type: `() => TParentRoute`
- Required
- A function that returns the parent route of the route being created. This is required to provide full type safety to child route configurations and to ensure that the route tree is built correctly.

### `path` property

- Type: `string`
- Required, unless an `id` is provided to configure the route as a layout route
- The path segment that will be used to match the route.

### `id` property

- Type: `string`
- Optional, but required if a `path` is not provided
- The unique identifier for the route if it is to be configured as a layout route. If provided, the, the route will not match against the location pathname and its routes will be flattened into its parent route for matching.

### `component` property

- Type: `RouteComponent` or `LazyRouteComponent`
- Optional - Defaults to `<Outlet />`
- The content to be rendered when the route is matched.

### `errorComponent` property

- Type: `RouteComponent` or `LazyRouteComponent`
- Optional - Defaults to `routerOptions.defaultErrorComponent`
- The content to be rendered when the route encounters an error.

### `pendingComponent` property

- Type: `RouteComponent` or `LazyRouteComponent`
- Optional - Defaults to `routerOptions.defaultPendingComponent`
- The content to be rendered if and when the route is pending and has reached its pendingMs threshold.

### `notFoundComponent` property

- Type: `NotFoundRouteComponent` or `LazyRouteComponent`
- Optional - Defaults to `routerOptions.defaultNotFoundComponent`
- The content to be rendered when the route is not found.

### `validateSearch` method

- Type: `(rawSearchParams: unknown) => TSearchSchema`
- Optional
- A function that will be called when this route is matched and passed the raw search params from the current location and return valid parsed search params. If this function throws, the route will be put into an error state and the error will be thrown during render. If this function does not throw, its return value will be used as the route's search params and the return type will be inferred into the rest of the router.
- Optionally, the parameter type can be tagged with the `SearchSchemaInput` type like this: `(searchParams: TSearchSchemaInput & SearchSchemaInput) => TSearchSchema`. If this tag is present, `TSearchSchemaInput` will be used to type the `search` property of `<Link />` and `navigate()` **instead of** `TSearchSchema`. The difference between `TSearchSchemaInput` and `TSearchSchema` can be useful, for example, to express optional search parameters.

### `parseParams` method (⚠️ deprecated)

- Type: `(rawParams: Record<string, string>) => TParams`
- Optional
- A function that will be called when this route is matched and passed the raw params from the current location and return valid parsed params. If this function throws, the route will be put into an error state and the error will be thrown during render. If this function does not throw, its return value will be used as the route's params and the return type will be inferred into the rest of the router.

### `stringifyParams` method (⚠️ deprecated)

- Type: `(params: TParams) => Record<string, string>`
- Required if `parseParams` is provided
- A function that will be called when this routes parsed params are being used to build a location. This function should return a valid object of `Record<string, string>` mapping.

### `params.parse` method

- Type: `(rawParams: Record<string, string>) => TParams`
- Optional
- A function that will be called when this route is matched and passed the raw params from the current location and return valid parsed params. If this function throws, the route will be put into an error state and the error will be thrown during render. If this function does not throw, its return value will be used as the route's params and the return type will be inferred into the rest of the router.

### `params.stringify` method

- Type: `(params: TParams) => Record<string, string>`
- A function that will be called when this routes parsed params are being used to build a location. This function should return a valid object of `Record<string, string>` mapping.

### `beforeLoad` method

- Type:

```tsx
type beforeLoad = (
  opts: RouteMatch & {
    search: TFullSearchSchema
    abortController: AbortController
    preload: boolean
    params: TAllParams
    context: TParentContext
    location: ParsedLocation
    navigate: NavigateFn<AnyRoute> // @deprecated
    buildLocation: BuildLocationFn<AnyRoute>
    cause: 'enter' | 'stay'
  },
) => Promise<TRouteContext> | TRouteContext | void
```

- Optional
- [`ParsedLocation`](./ParsedLocationType.md)
- This async function is called before a route is loaded. If an error is thrown here, the route's loader will not be called and the route will not render. If thrown during a navigation, the navigation will be cancelled and the error will be passed to the `onError` function. If thrown during a preload event, the error will be logged to the console and the preload will fail.
- If this function returns a promise, the route will be put into a pending state and cause rendering to suspend until the promise resolves. If this routes pendingMs threshold is reached, the `pendingComponent` will be shown until it resolved. If the promise rejects, the route will be put into an error state and the error will be thrown during render.
- If this function returns a `TRouteContext` object, that object will be merged into the route's context and be made available in the `loader` and other related route components/methods.
- It's common to use this function to check if a user is authenticated and redirect them to a login page if they are not. To do this, you can either return or throw a `redirect` object from this function.

> 🚧 `opts.navigate` has been deprecated and will be removed in the next major release. Use `throw redirect({ to: '/somewhere' })` instead. Read more about the `redirect` function [here](./redirectFunction.md).

### `loader` method

- Type:

```tsx
type loader = (
  opts: RouteMatch & {
    search: TFullSearchSchema
    abortController: AbortController
    preload: boolean
    params: TAllParams
    context: TAllContext
    location: ParsedLocation
    navigate: NavigateFn<AnyRoute> // @deprecated
    buildLocation: BuildLocationFn<AnyRoute>
    cause: 'enter' | 'stay'
  },
) => Promise<TLoaderData> | TLoaderData | void
```

- Optional
- [`ParsedLocation`](./ParsedLocationType.md)
- This async function is called when a route is matched and passed the route's match object. If an error is thrown here, the route will be put into an error state and the error will be thrown during render. If thrown during a navigation, the navigation will be cancelled and the error will be passed to the `onError` function. If thrown during a preload event, the error will be logged to the console and the preload will fail.
- If this function returns a promise, the route will be put into a pending state and cause rendering to suspend until the promise resolves. If this routes pendingMs threshold is reached, the `pendingComponent` will be shown until it resolved. If the promise rejects, the route will be put into an error state and the error will be thrown during render.
- If this function returns a `TLoaderData` object, that object will be stored on the route match until the route match is no longer active. It can be accessed using the `useLoaderData` hook in any component that is a child of the route match before another `<Outlet />` is rendered.

> 🚧 `opts.navigate` has been deprecated and will be removed in the next major release. Use `throw redirect({ to: '/somewhere' })` instead. Read more about the `redirect` function [here](./redirectFunction.md).

### `loaderDeps` method

- Type:

```tsx
type loaderDeps = (opts: { search: TFullSearchSchema }) => Record<string, any>
```

- Optional
- A function that will be called before this route is matched to provide additional unique identification to the route match and serve as a dependency tracker for when the match should be reloaded. It should return any serializable value that can uniquely identify the route match from navigation to navigation.
- By default, path params are already used to uniquely identify a route match, so it's unnecessary to return these here.
- If your route match relies on search params for unique identification, it's required that you return them here so they can be made available in the `loader`'s `deps` argument.

### `staleTime` property

- Type: `number`
- Optional
- Defaults to `routerOptions.defaultStaleTime`, which defaults to `0`
- The amount of time in milliseconds that a route match's loader data will be considered fresh. If a route match is matched again within this time frame, its loader data will not be reloaded.

### `preloadStaleTime` property

- Type: `number`
- Optional
- Defaults to `routerOptions.defaultPreloadStaleTime`, which defaults to `30_000` ms (30 seconds)
- The amount of time in milliseconds that a route match's loader data will be considered fresh when preloading. If a route match is preloaded again within this time frame, its loader data will not be reloaded. If a route match is loaded (for navigation) within this time frame, the normal `staleTime` is used instead.

### `gcTime` property

- Type: `number`
- Optional
- Defaults to `routerOptions.defaultGcTime`, which defaults to 30 minutes.
- The amount of time in milliseconds that a route match's loader data will be kept in memory after a preload or it is no longer in use.

### `shouldReload` property

- Type: `boolean | ((args: LoaderArgs) => boolean)`
- Optional
- If `false` or returns `false`, the route match's loader data will not be reloaded on subsequent matches.
- If `true` or returns `true`, the route match's loader data will be reloaded on subsequent matches.
- If `undefined` or returns `undefined`, the route match's loader data will adhere to the default stale-while-revalidate behavior.

### `caseSensitive` property

- Type: `boolean`
- Optional
- If `true`, this route will be matched as case-sensitive

### `wrapInSuspense` property

- Type: `boolean`
- Optional
- If `true`, this route will be forcefully wrapped in a suspense boundary, regardless if a reason is found to do so from inspecting its provided components.

### `pendingMs` property

- Type: `number`
- Optional
- Defaults to `routerOptions.defaultPendingMs`, which defaults to `1000`
- The threshold in milliseconds that a route must be pending before its `pendingComponent` is shown.

### `pendingMinMs` property

- Type: `number`
- Optional
- Defaults to `routerOptions.defaultPendingMinMs` which defaults to `500`
- The minimum amount of time in milliseconds that the pending component will be shown for if it is shown. This is useful to prevent the pending component from flashing on the screen for a split second.

### `preloadMaxAge` property

- Type: `number`
- Optional
- Defaults to `30_000` ms (30 seconds)
- The maximum amount of time in milliseconds that a route's preloaded route data will be cached for. If a route is not matched within this time frame, its loader data will be discarded.

### `preSearchFilters` property

- Type: `((search: TFullSearchSchema) => TFullSearchSchema)[]`
- Optional
- An array of functions that will be called when generating any new links to this route or its grandchildren.
- Each function will be called with the current search params and should return a new search params object that will be used to generate the link.
- It has a `pre` prefix because it is called before the user-provided function that is passed to `navigate`/`Link` etc has a chance to modify the search params.

### `postSearchFilters` property

- Type: `((search: TFullSearchSchema) => TFullSearchSchema)[]`
- Optional
- An array of functions that will be called when generating any new links to this route or its grandchildren.
- Each function will be called with the current search params and should return a new search params object that will be used to generate the link.
- It has a `post` prefix because it is called after the user-provided function that is passed to `navigate`/`Link` etc has modified the search params.

### `onError` property

- Type: `(error: any) => void`
- Optional
- A function that will be called when an error is thrown during a navigation or preload event.
- If this function throws a [`redirect`](./redirectFunction.md), then the router will process and apply the redirect immediately.

### `onEnter` property

- Type: `(match: RouteMatch) => void`
- Optional
- A function that will be called when a route is matched and loaded after not being matched in the previous location.

### `onStay` property

- Type: `(match: RouteMatch) => void`
- Optional
- A function that will be called when a route is matched and loaded after being matched in the previous location.

### `onLeave` property

- Type: `(match: RouteMatch) => void`
- Optional
- A function that will be called when a route is no longer matched after being matched in the previous location.

### `onCatch` property

- Type: `(error: Error, errorInfo: ErrorInfo) => void`
- Optional - Defaults to `routerOptions.defaultOnCatch`
- A function that will be called when errors are caught when the route encounters an error.
