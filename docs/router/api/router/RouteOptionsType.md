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
- Required, unless an `id` is provided to configure the route as a pathless layout route
- The path segment that will be used to match the route.

### `id` property

- Type: `string`
- Optional, but required if a `path` is not provided
- The unique identifier for the route if it is to be configured as a pathless layout route. If provided, the route will not match against the location pathname and its routes will be flattened into its parent route for matching.

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
- This is a planning callback. It must be deterministic and side-effect-free for the same input; do not navigate or mutate application/router state from it.
- Optionally, the parameter type can be tagged with the `SearchSchemaInput` type like this: `(searchParams: TSearchSchemaInput & SearchSchemaInput) => TSearchSchema`. If this tag is present, `TSearchSchemaInput` will be used to type the `search` property of `<Link />` and `navigate()` **instead of** `TSearchSchema`. The difference between `TSearchSchemaInput` and `TSearchSchema` can be useful, for example, to express optional search parameters.

### `search.middlewares` property

- Type: `(({search: TSearchSchema, next: (newSearch: TSearchSchema) => TSearchSchema}) => TSearchSchema)[]`
- Optional
- Search middlewares are functions that transform the search parameters when generating new links for a route or its descendants.
- A search middleware is passed in the current search (if it is the first middleware to run) or is invoked by the previous middleware calling `next`.

### `parseParams` method (⚠️ deprecated, use `params.parse` instead)

- Type: `(rawParams: Record<string, string>) => TParams`
- Optional
- A function that will be called when this route is matched and passed the raw params from the current location and return valid parsed params. If this function throws, the route will be put into an error state and the error will be thrown during render. If this function does not throw, its return value will be used as the route's params and the return type will be inferred into the rest of the router.
- This is a planning callback. It must be deterministic and side-effect-free for the same input.

### `stringifyParams` method (⚠️ deprecated, use `params.stringify` instead)

- Type: `(params: TParams) => Record<string, string>`
- Required if `parseParams` is provided
- A function that will be called when this route's parsed params are being used to build a location. This function should return a valid object of `Record<string, string>` mapping.

### `params.parse` method

- Type: `(rawParams: Record<string, string>) => TParams | false`
- Optional
- A function that will be called when this route is matched and passed the raw params from the current location and return valid parsed params. If this function throws, the route will be put into an error state and the error will be thrown during render. If this function returns parsed params, its return value will be used as the route's params and the return type will be inferred into the rest of the router.
- This is a planning callback. It must be deterministic and side-effect-free for the same input.
- Experimental: returning `false` during incoming route matching skips this route and allows matching to continue to another candidate route.

### `params.priority` property

- Type: `number`
- Optional
- Defaults to `0`
- Controls the matching order when multiple route candidates with `params.parse` can match the same URL segment. Higher numbers are tried first. If a higher-priority route's `params.parse` returns `false`, matching continues to the next candidate.
- This only affects competing candidates that use `params.parse`; normal route specificity still applies, so static routes continue to match before dynamic, optional, or wildcard routes.

### `params.stringify` method

- Type: `(params: TParams) => Record<string, string>`
- A function that will be called when this route's parsed params are being used to build a location. This function should return a valid object of `Record<string, string>` mapping.

### Lifecycle object form

> **Experimental:** the route `context` option and the `dehydrate` and `hydrate` keys of `beforeLoad` and `loader` are experimental and subject to change.

`context`, `beforeLoad` and `loader` each accept either a function or an object with a `handler` function and a few keys next to it:

```tsx
type context =
  | contextFn
  | {
      handler: contextFn
      dehydrate?: boolean | DehydrateFn
      hydrate?: HydrateFn
      revalidate?: boolean | RevalidateFn
    }

type beforeLoad =
  | beforeLoadFn
  | {
      handler: beforeLoadFn
      dehydrate?: boolean | DehydrateFn
      hydrate?: HydrateFn
    }

type loader =
  | loaderFn
  | {
      handler: loaderFn
      dehydrate?: boolean | DehydrateFn
      hydrate?: HydrateFn
      staleReloadMode?: 'background' | 'blocking'
    }

type DehydrateFn = (opts: HandlerOpts & { data: TData }) => TWire // server; TWire must be serializable
type HydrateFn = (opts: HandlerOpts & { data: TWire | TData }) => TData // client; data is TWire when dehydrate is a function
type RevalidateFn = (
  opts: HandlerOpts & { prev: TData | undefined },
) => Promise<TData> | TData
```

- `handler` is the lifecycle function. It is required in the object form and receives the same options as the function form.
- `dehydrate` and `hydrate` control what the server sends to the client during SSR. `dehydrate: true` sends the handler's result; `dehydrate: false` keeps it on the server, and the client runs the handler again during hydration; a `dehydrate` function receives the handler's options plus `data` (the awaited result) and returns the wire value; `hydrate` receives the options plus `data` (the wire value when `dehydrate` is a function, otherwise the full result) and returns the value the app uses on the client. Defaults: `context` is not sent, `beforeLoad` and `loader` are. A sent value must be serializable. TanStack Start type-checks this, and so does router-only SSR when `Register` has `ssr: true` (see [SSR](../../guide/ssr.md#what-crosses-the-wire)). Routes with `ssr: false` are not checked.
- `revalidate` exists on `context` only; `staleReloadMode` on `loader` only.
- A `dehydrate` function requires `hydrate`. `hydrate` requires `dehydrate` (`true` or a function); without a `dehydrate` key, or with `dehydrate: false`, `hydrate` is rejected.
- Write the keys in this order: `handler`, `dehydrate`, `hydrate`, then `revalidate` or `staleReloadMode`. The parameters of the later keys are inferred from the earlier ones. The [`create-route-property-order`](../../eslint/create-route-property-order.md) lint rule checks the order and can fix it. TypeScript does not check the order. A wrong order shows up as a type error only when it breaks that inference, and the error rarely says so:
  - A `handler` that reads its options, written after a function that reads `data` or `prev`, gets an error that says to write `handler` first. This is the error when the object has a `dehydrate` function or `dehydrate: false`.
  - With `dehydrate: true`, or without a `dehydrate` key, the same `handler` gets an error that its result is not assignable to `never`. That error needs the serializability check from the item above. Without the check, the order compiles next to `dehydrate: true`, and without a `dehydrate` key the error says that `dehydrate` is missing.
  - A `hydrate` that reads `data`, written before a `dehydrate` function, gets an error that the `dehydrate` function is not assignable to `true`.
  - A `revalidate` that reads `prev`, written before a `hydrate` that returns a different shape, gets an error about the type `hydrate` returns.

  Other wrong orders compile. When one of these errors appears, fix the key order. Do not add `dehydrate: true` or switch to it to make the error go away: that sends the handler's full result to the client.

- Never annotate the parameters of `dehydrate`, `hydrate` or `revalidate`. They are inferred. Next to `dehydrate: true`, write `hydrate` inline: a `hydrate` passed by reference or typed through `satisfies` or `as` decides the type of `data` itself, and neither TypeScript nor the lint rule checks it against `handler`.
- `dehydrate` and `hydrate` may be async; the awaited value is used. They only transform a value; throw `redirect()` or `notFound()` from `handler`. A throw from `dehydrate`, a `redirect()` or `notFound()` included, is an ordinary error of that match. A throw from `hydrate`, or a `redirect()` or `notFound()` returned from the `hydrate` of `beforeLoad` or `loader`, is a failure during hydration (next item): the client load runs `handler` instead, and `hydrate` itself never shows the `errorComponent` or calls `onError`.
- A lifecycle that fails while the client runs it during hydration (an error, a thrown `redirect()` or `notFound()` or one returned from `beforeLoad` or `loader`, or a throwing `hydrate`) is not handled by hydration. The route is shown as pending and the client load that follows hydration runs it again; that run's outcome (data, error, redirect or not-found) is handled as on a client navigation. A lifecycle that the client re-ran during hydration and that failed there therefore runs twice on the client, and so do its side effects; some lifecycles that succeeded during hydration run again as well. A route the server already rendered as an error or not-found, and the root route when it shows the not-found page, keep that result: during hydration only their `context` and the `hydrate` of sent results run there. A `beforeLoad` or `loader` result that was not sent is missing there in the browser. A failure there makes nothing run again, and the result that failed is missing too. See [When a lifecycle fails during hydration](/start/latest/docs/framework/react/guide/ssr-data-transport#when-a-lifecycle-fails-during-hydration).
- `hydrate` may return a different type than `handler`. The lifecycle's data type is then the union of both; a `hydrate` result that is assignable to the handler's data reduces to it, so a property that only `hydrate` adds to a matching shape is not visible. Narrow on a literal written with `as const` on both sides that says which function produced the value (`hydrated: false` in `handler`, `hydrated: true` in `hydrate`), not on server versus client: `handler` also runs in the browser on client navigations. See [Narrow with a discriminant](/start/latest/docs/framework/react/guide/ssr-data-transport#narrow-with-a-discriminant).
- On a route with `ssr: true`, a lifecycle with `dehydrate: false` must produce the same value on the client as on the server, and a `hydrate` result must render the same as the server's value; otherwise the first client render differs from the server HTML. Use `ssr: 'data-only'` when they cannot be the same.
- Removing `dehydrate` from the client bundle and `hydrate`/`revalidate` from the server bundle is done by the TanStack Start build; see [SSR Data Transport](/start/latest/docs/framework/react/guide/ssr-data-transport). In a router-only setup both halves stay in both bundles unless each production build gets its own `deleteNodes` list; see [Removing route options from a build](../../guide/automatic-code-splitting.md#removing-route-options-from-a-build-deletenodes).

### `context` method

> **Experimental:** the route `context` option is experimental and subject to change.

- Type:

```tsx
type contextFn = (opts: {
  abortController: AbortController
  preload: boolean
  params: TAllParams
  deps: TLoaderDeps
  context: TParentContext
  location: ParsedLocation
  matches: Array<RouteMatch>
  routeId: TRouteId
  navigate: NavigateFn<AnyRoute> // @deprecated
  buildLocation: BuildLocationFn<AnyRoute>
  cause: 'preload' | 'enter' | 'stay'
  serverContext?: TServerContext // TanStack Start only, undefined on the client
}) => Promise<TRouteContext> | TRouteContext | void

type context =
  | contextFn
  | {
      handler: contextFn
      dehydrate?: boolean | DehydrateFn
      hydrate?: HydrateFn
      revalidate?: boolean | RevalidateFn
    }
```

- Optional
- [`ParsedLocation`](./ParsedLocationType.md)
- Runs before this route's `beforeLoad`. The lifecycles run serially, one route after the other, parent first: `context` then `beforeLoad` of the first match, then `context` then `beforeLoad` of the second match, and so on. Loaders run after that.
- `opts.context` is the parent's effective context: the router context plus every ancestor's `context` result and `beforeLoad` result. The returned object is merged into the context that this route's `beforeLoad`, `loader`, components and child routes see.
- May return a promise. The route is pending while it resolves and the awaited value is merged.
- Receives `deps`, the result of `loaderDeps`, and not `search`. The result is cached per match, and a match is keyed by its params and `loaderDeps`, so a `context` must not depend on search params outside `loaderDeps`.
- Computed once per match and reused on later loads. `router.invalidate()` does not re-run it unless `revalidate` is set. A navigation that starts while a preload's async `context` for the same match is still running runs it again.
- `revalidate: true` runs `handler` again on `router.invalidate()`. `revalidate: fn` runs that function instead; it receives `prev`, the current context data (the last successful `handler`, `hydrate` or `revalidate` result, or `undefined` if none has succeeded yet), and must return the handler's shape. There is no time-based revalidation of context.
- If it throws, this route's `beforeLoad`, its loader and its descendants do not run, and the error becomes the match's error state.
- During SSR the result is not sent to the client by default; the client computes it again during hydration. `dehydrate: true` sends it. See [Lifecycle object form](#lifecycle-object-form).

### `beforeLoad` method

- Type:

```tsx
type beforeLoadFn = (
  opts: RouteMatch & {
    search: TFullSearchSchema
    abortController: AbortController
    preload: boolean
    params: TAllParams
    context: TParentContext
    location: ParsedLocation
    navigate: NavigateFn<AnyRoute> // @deprecated
    buildLocation: BuildLocationFn<AnyRoute>
    cause: 'preload' | 'enter' | 'stay'
  },
) => Promise<TRouteContext> | TRouteContext | void

type beforeLoad =
  | beforeLoadFn
  | {
      handler: beforeLoadFn
      dehydrate?: boolean | DehydrateFn
      hydrate?: HydrateFn
    }
```

- Optional
- [`ParsedLocation`](./ParsedLocationType.md)
- This async function is called before a route is loaded, after the route's `context`. It runs on every load; it is not cached. If it fails, the route's loader and its descendants will not run. During navigation, ordinary errors become the match's error state and are passed to the `onError` function. During a preload, ordinary errors and not-found results are represented in the returned speculative match lane instead of rejecting the `preloadRoute` promise.
- If this function returns a promise, the route will be put into a pending state and cause rendering to suspend until the promise resolves. If this route's pendingMs threshold is reached, the `pendingComponent` will be shown until it resolves. If the promise rejects, the route will be put into an error state and the error will be thrown during render.
- If this function returns a `TRouteContext` object, that object will be merged into the route's context and be made available in the `loader` and other related route components/methods.
- `opts.context` is the parent context plus this route's own `context` result.
- It's common to use this function to check if a user is authenticated and redirect them to a login page if they are not. To do this, you can either return or throw a `redirect` object from this function.
- During SSR the result is sent to the client by default. The object form adds `dehydrate` and `hydrate` (experimental); see [Lifecycle object form](#lifecycle-object-form).

> 🚧 `opts.navigate` has been deprecated and will be removed in the next major release. Use `throw redirect({ to: '/somewhere' })` instead. Read more about the `redirect` function [here](./redirectFunction.md).

### `loader` method

- Type:

```tsx
type loaderFn = (
  opts: RouteMatch & {
    abortController: AbortController
    cause: 'preload' | 'enter' | 'stay'
    context: TAllContext
    deps: TLoaderDeps
    location: ParsedLocation
    params: TAllParams
    preload: boolean
    parentMatchPromise: Promise<MakeRouteMatchFromRoute<TParentRoute>>
    navigate: NavigateFn<AnyRoute> // @deprecated
    route: AnyRoute
  },
) => Promise<TLoaderData> | TLoaderData | void

type loader =
  | loaderFn
  | {
      handler: loaderFn
      dehydrate?: boolean | DehydrateFn
      hydrate?: HydrateFn
      staleReloadMode?: 'background' | 'blocking'
    }
```

- Optional
- [`ParsedLocation`](./ParsedLocationType.md)
- This async function is called when a route is matched and passed the route's match object. During navigation, ordinary errors become the match's error state and are passed to the `onError` function. During a preload, ordinary errors and not-found results are represented in the returned speculative match lane instead of rejecting the `preloadRoute` promise.
- If this function returns a promise, the route will be put into a pending state and cause rendering to suspend until the promise resolves. If this route's pendingMs threshold is reached, the `pendingComponent` will be shown until it resolves. If the promise rejects, the route will be put into an error state and the error will be thrown during render.
- If this function returns a `TLoaderData` object, that object will be stored on the route match and can remain available in the in-memory cache after the match becomes inactive. Navigation-owned data uses `gcTime` for retention, while preload-owned data uses `preloadGcTime`. It can be accessed using the `useLoaderData` hook in any component that is a child of the route match before another `<Outlet />` is rendered.
- Deps must be returned by your `loaderDeps` function in order to appear.
- `opts.context` is the parent context plus this route's own `context` and `beforeLoad` results.
- Use the object form to configure loader-specific behavior like `staleReloadMode`, `dehydrate` and `hydrate` (`dehydrate` and `hydrate` are experimental); see [Lifecycle object form](#lifecycle-object-form).
- `staleReloadMode: 'background'` preserves stale-while-revalidate behavior for stale successful matches.
- `staleReloadMode: 'blocking'` waits for the stale loader reload to complete before continuing.
- During SSR the loader data is sent to the client by default. In TanStack Start apps its type is checked for serializability; `dehydrate: false` or a serialization adapter lifts that requirement.

> 🚧 `opts.navigate` has been deprecated and will be removed in the next major release. Use `throw redirect({ to: '/somewhere' })` instead. Read more about the `redirect` function [here](./redirectFunction.md).

### `loaderDeps` method

- Type:

```tsx
type loaderDeps = (opts: { search: TFullSearchSchema }) => Record<string, any>
```

- Optional
- A function that will be called before this route is matched to provide additional unique identification to the route match and serve as a dependency tracker for when the match should be reloaded. It should return any serializable value that can uniquely identify the route match from navigation to navigation.
- This is a planning callback and cache-key function. It must be deterministic and side-effect-free for the same validated search input. The returned value and any serialization methods on it, such as `toJSON`, must also be side-effect-free.
- By default, path params are already used to uniquely identify a route match, so it's unnecessary to return these here.
- If your route match relies on search params for unique identification, it's required that you return them here so they can be made available in the `loader`'s `deps` argument.

### `staleTime` property

- Type: `number`
- Optional
- Defaults to `routerOptions.defaultStaleTime`, which defaults to `0`
- The amount of time in milliseconds that a route match's loader data will be considered fresh. If a route match is matched again within this time frame, its loader data will not be reloaded.

### `preload` property

- Type: `boolean`
- Optional
- Defaults to `true`
- If `false`, speculative preloads still run this route's `beforeLoad` function but skip its `loader`. A navigation runs both `beforeLoad` and the skipped `loader` normally.

### `preloadStaleTime` property

- Type: `number`
- Optional
- Defaults to `routerOptions.defaultPreloadStaleTime`, which defaults to `30_000` ms (30 seconds)
- The amount of time in milliseconds that loader data produced by a preload is considered fresh. Another preload or the first navigation can reuse it within this interval. After navigation accepts the generation, subsequent freshness uses `staleTime`.

### `gcTime` property

- Type: `number`
- Optional
- Defaults to `routerOptions.defaultGcTime`, which defaults to 5 minutes.
- The retention window in milliseconds for unused loader data from an ordinary load. Once the data is older than this value, it is eligible for pruning during a later cache reconciliation.

### `shouldReload` property

- Type: `boolean | ((args: LoaderArgs) => boolean)`
- Optional
- If `false` or returns `false`, the route match's loader data will not be reloaded on subsequent matches.
- If `true` or returns `true`, the route match's loader data will be reloaded on subsequent matches.
- If `undefined` or returns `undefined`, the route match's loader data will adhere to the default stale-while-revalidate behavior.

### `caseSensitive` property

- Type: `boolean`
- Optional
- If `true`, this route will be matched as case-sensitive.

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

### `preloadGcTime` property

- Type: `number`
- Optional
- Defaults to `routerOptions.defaultPreloadGcTime`, which defaults to 5 minutes.
- The retention window in milliseconds for unused loader data produced by a preload. Once the data is older than this value, it is eligible for pruning during a later cache reconciliation. Use `preloadStaleTime` to control whether retained data is fresh enough to reuse without reloading.

### `preSearchFilters` property (⚠️ deprecated, use `search.middlewares` instead)

- Type: `((search: TFullSearchSchema) => TFullSearchSchema)[]`
- Optional
- An array of functions that will be called when generating any new links to this route or its grandchildren.
- Each function will be called with the current search params and should return a new search params object that will be used to generate the link.
- It has a `pre` prefix because it is called before the user-provided function that is passed to `navigate`/`Link` etc has a chance to modify the search params.

### `postSearchFilters` property (⚠️ deprecated, use `search.middlewares` instead)

- Type: `((search: TFullSearchSchema) => TFullSearchSchema)[]`
- Optional
- An array of functions that will be called when generating any new links to this route or its grandchildren.
- Each function will be called with the current search params and should return a new search params object that will be used to generate the link.
- It has a `post` prefix because it is called after the user-provided function that is passed to `navigate`/`Link` etc has modified the search params.

### `onError` property

- Type: `(error: any) => void`
- Optional
- A function that will be called when an error is thrown during a navigation or preload event.
- If this function throws a [`redirect`](./redirectFunction.md), the redirect replaces the original error and becomes control flow for the current navigation or preload operation. If it throws a not-found result, that result replaces the original error in the current match lane.

### `onEnter` property

- Type: `(match: RouteMatch) => void`
- Optional
- A function that will be called when a route is matched and loaded after not being matched in the previous location.
- Routes below an error or not-found boundary do not enter the active route lifecycle. The boundary itself remains active. A previously hidden route receives `onEnter` when a navigation makes it active again.

### `onStay` property

- Type: `(match: RouteMatch) => void`
- Optional
- A function that will be called when a route is matched and loaded after being matched in the previous location.
- Both navigations must include the route in the active branch, through the first error or not-found boundary.

### `onLeave` property

- Type: `(match: RouteMatch) => void`
- Optional
- A function that will be called when a route is no longer matched after being matched in the previous location.
- This also runs when a navigation hides a previously active route below an error or not-found boundary, even if the route remains structurally matched.
- Background reloads update route data without dispatching these lifecycle callbacks.

### `onCatch` property

- Type: `(error: unknown) => void` in React and Vue; `(error: Error) => void` in Solid
- Optional - Defaults to `routerOptions.defaultOnCatch`
- A function that will be called when errors are caught when the route encounters an error.

### `remountDeps` method

- Type:

```tsx
type remountDeps = (opts: RemountDepsOptions) => any

interface RemountDepsOptions<
  in out TRouteId,
  in out TFullSearchSchema,
  in out TAllParams,
  in out TLoaderDeps,
> {
  routeId: TRouteId
  search: TFullSearchSchema
  params: TAllParams
  loaderDeps: TLoaderDeps
}
```

- Optional
- A function that will be called to determine whether a route component shall be remounted after navigation. If this function returns a different value than previously, it will remount.
- The return value needs to be JSON serializable.
- By default, a route component will not be remounted if it stays active after a navigation.

Example:
If you want to configure to remount a route component upon `params` change, use:

```tsx
remountDeps: ({ params }) => params
```

### `headers` method

- Type:

```tsx
type headers = (opts: {
  matches: Array<RouteMatch>
  match: RouteMatch
  params: TAllParams
  loaderData?: TLoaderData
}) => Promise<Record<string, string>> | Record<string, string>
```

- Optional
- Allows you to specify custom HTTP headers to be sent when this route is rendered during SSR. The function receives the current match context and should return a plain object of header name/value pairs.

### `head` method

- Type:

```tsx
type head = (ctx: {
  matches: Array<RouteMatch>
  match: RouteMatch
  params: TAllParams
  loaderData?: TLoaderData
}) =>
  | Promise<{
      links?: RouteMatch['links']
      scripts?: RouteMatch['headScripts']
      meta?: RouteMatch['meta']
      styles?: RouteMatch['styles']
    }>
  | {
      links?: RouteMatch['links']
      scripts?: RouteMatch['headScripts']
      meta?: RouteMatch['meta']
      styles?: RouteMatch['styles']
    }
```

- Optional
- Returns additional elements to inject into the document `<head>` for this route. Use it to add route-level SEO metadata, preload links, inline styles, or custom scripts.

### `scripts` method

- Type:

```tsx
type scripts = (ctx: {
  matches: Array<RouteMatch>
  match: RouteMatch
  params: TAllParams
  loaderData?: TLoaderData
}) => Promise<RouteMatch['scripts']> | RouteMatch['scripts']
```

- Optional
- A shorthand helper to return only `<script>` elements. Equivalent to returning the `scripts` field from the `head` method.

### `codeSplitGroupings` property

- Type: `Array<Array<'loader' | 'component' | 'pendingComponent' | 'notFoundComponent' | 'errorComponent'>>`
- Optional
- Fine-grained control over how the router groups lazy-loaded pieces of a route into chunks. Each inner array represents a group of assets that will be placed into the same bundle during code-splitting.
