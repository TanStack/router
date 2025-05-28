# ActiveLinkOptions type

The `ActiveLinkOptions` type extends the [`LinkOptions`](../LinkOptionsType.md) type and contains additional options that can be used to describe how a link should be styled when it is active.

```tsx
type ActiveLinkOptions = LinkOptions & {
  activeProps?:
    | React.AnchorHTMLAttributes<HTMLAnchorElement>
    | (() => React.AnchorHTMLAttributes<HTMLAnchorElement>)
  inactiveProps?:
    | React.AnchorHTMLAttributes<HTMLAnchorElement>
    | (() => React.AnchorHTMLAttributes<HTMLAnchorElement>)
}
```

## ActiveLinkOptions properties

The `ActiveLinkOptions` object accepts/contains the following properties:

### `activeProps`

- `React.AnchorHTMLAttributes<HTMLAnchorElement>`
- Optional
- The props that will be applied to the anchor element when the link is active

### `inactiveProps`

- Type: `React.AnchorHTMLAttributes<HTMLAnchorElement>`
- Optional
- The props that will be applied to the anchor element when the link is inactive

# AsyncRouteComponent type

The `AsyncRouteComponent` type is used to describe a code-split route component that can be preloaded using a `component.preload()` method.

```tsx
type AsyncRouteComponent<TProps> = SyncRouteComponent<TProps> & {
  preload?: () => Promise<void>
}
```

# FileRoute class

> [!CAUTION]
> This class has been deprecated and will be removed in the next major version of TanStack Router.
> Please use the [`createFileRoute`](../createFileRouteFunction.md) function instead.

The `FileRoute` class is a factory that can be used to create a file-based route instance. This route instance can then be used to automatically generate a route tree with the `tsr generate` and `tsr watch` commands.

## `FileRoute` constructor

The `FileRoute` constructor accepts a single argument: the `path` of the file that the route will be generated for.

### Constructor options

- Type: `string` literal
- Required, but **automatically inserted and updated by the `tsr generate` and `tsr watch` commands**.
- The full path of the file that the route will be generated from.

### Constructor returns

- An instance of the `FileRoute` class that can be used to create a route.

## `FileRoute` methods

The `FileRoute` class implements the following method(s):

### `.createRoute` method

The `createRoute` method is a method that can be used to configure the file route instance. It accepts a single argument: the `options` that will be used to configure the file route instance.

#### .createRoute options

- Type: `Omit<RouteOptions, 'getParentRoute' | 'path' | 'id'>`
- [`RouteOptions`](../RouteOptionsType.md)
- Optional
- The same options that are available to the `Route` class, but with the `getParentRoute`, `path`, and `id` options omitted since they are unnecessary for file-based routing.

#### .createRoute returns

A [`Route`](../RouteType.md) instance that can be used to configure the route to be inserted into the route-tree.

> ⚠️ Note: For `tsr generate` and `tsr watch` to work properly, the file route instance must be exported from the file using the `Route` identifier.

### Examples

```tsx
import { FileRoute } from '@tanstack/react-router'

export const Route = new FileRoute('/').createRoute({
  loader: () => {
    return 'Hello World'
  },
  component: IndexComponent,
})

function IndexComponent() {
  const data = Route.useLoaderData()
  return <div>{data}</div>
}
```

# LinkOptions type

The `LinkOptions` type extends the [`NavigateOptions`](../NavigateOptionsType.md) type and contains additional options that can be used by TanStack Router when handling actual anchor element attributes.

```tsx
type LinkOptions = NavigateOptions & {
  target?: HTMLAnchorElement['target']
  activeOptions?: ActiveOptions
  preload?: false | 'intent'
  preloadDelay?: number
  disabled?: boolean
}
```

## LinkOptions properties

The `LinkOptions` object accepts/contains the following properties:

### `target`

- Type: `HTMLAnchorElement['target']`
- Optional
- The standard anchor tag target attribute

### `activeOptions`

- Type: `ActiveOptions`
- Optional
- The options that will be used to determine if the link is active

### `preload`

- Type: `false | 'intent' | 'viewport' | 'render'`
- Optional
- If set, the link's preloading strategy will be set to this value.
- See the [Preloading guide](../../../guide/preloading.md) for more information.

### `preloadDelay`

- Type: `number`
- Optional
- Delay intent preloading by this many milliseconds. If the intent exits before this delay, the preload will be cancelled.

### `disabled`

- Type: `boolean`
- Optional
- If true, will render the link without the href attribute

# LinkProps type

The `LinkProps` type extends the [`ActiveLinkOptions`](../ActiveLinkOptionsType.md) and `React.AnchorHTMLAttributes<HTMLAnchorElement>` types and contains additional props specific to the `Link` component.

```tsx
type LinkProps = ActiveLinkOptions &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & {
    children?:
      | React.ReactNode
      | ((state: { isActive: boolean }) => React.ReactNode)
  }
```

## LinkProps properties

- All of the props from [`ActiveLinkOptions`](../ActiveLinkOptionsType.md)
- All of the props from `React.AnchorHTMLAttributes<HTMLAnchorElement>`

#### `children`

- Type: `React.ReactNode | ((state: { isActive: boolean }) => React.ReactNode)`
- Optional
- The children that will be rendered inside of the anchor element. If a function is provided, it will be called with an object that contains the `isActive` boolean value that can be used to determine if the link is active.

# MatchRouteOptions type

The `MatchRouteOptions` type is used to describe the options that can be used when matching a route.

```tsx
interface MatchRouteOptions {
  pending?: boolean
  caseSensitive?: boolean
  includeSearch?: boolean
  fuzzy?: boolean
}
```

## MatchRouteOptions properties

The `MatchRouteOptions` type has the following properties:

### `pending` property

- Type: `boolean`
- Optional
- If `true`, will match against pending location instead of the current location

### `caseSensitive` property

- Type: `boolean`
- Optional
- If `true`, will match against the current location with case sensitivity

### `includeSearch` property

- Type: `boolean`
- Optional
- If `true`, will match against the current location's search params using a deep inclusive check. e.g. `{ a: 1 }` will match for a current location of `{ a: 1, b: 2 }`

### `fuzzy` property

- Type: `boolean`
- Optional
- If `true`, will match against the current location using a fuzzy match. e.g. `/posts` will match for a current location of `/posts/123`

# NavigateOptions type

The `NavigateOptions` type is used to describe the options that can be used when describing a navigation action in TanStack Router.

```tsx
type NavigateOptions = ToOptions & {
  replace?: boolean
  resetScroll?: boolean
  hashScrollIntoView?: boolean | ScrollIntoViewOptions
  viewTransition?: boolean | ViewTransitionOptions
  ignoreBlocker?: boolean
  reloadDocument?: boolean
  href?: string
}
```

## NavigateOptions properties

The `NavigateOptions` object accepts the following properties:

### `replace`

- Type: `boolean`
- Optional
- Defaults to `false`.
- If `true`, the location will be committed to the browser history using `history.replace` instead of `history.push`.

### `resetScroll`

- Type: `boolean`
- Optional
- Defaults to `true` so that the scroll position will be reset to 0,0 after the location is committed to the browser history.
- If `false`, the scroll position will not be reset to 0,0 after the location is committed to history.

### `hashScrollIntoView`

- Type: `boolean | ScrollIntoViewOptions`
- Optional
- Defaults to `true` so the element with an id matching the hash will be scrolled into view after the location is committed to history.
- If `false`, the element with an id matching the hash will not be scrolled into view after the location is committed to history.
- If an object is provided, it will be passed to the `scrollIntoView` method as options.
- See [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView) for more information on `ScrollIntoViewOptions`.

### `viewTransition`

- Type: `boolean | ViewTransitionOptions`
- Optional
- Defaults to `false`.
- If `true`, navigation will be called using `document.startViewTransition()`.
- If [`ViewTransitionOptions`](../ViewTransitionOptionsType.md), route navigations will be called using `document.startViewTransition({update, types})` where `types` will be the strings array passed with `ViewTransitionOptions["types"]`. If the browser does not support viewTransition types, the navigation will fall back to normal `document.startTransition()`, same as if `true` was passed.
- If the browser does not support this api, this option will be ignored.
- See [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition) for more information on how this function works.
- See [Google](https://developer.chrome.com/docs/web-platform/view-transitions/same-document#view-transition-types) for more information on viewTransition types

### `ignoreBlocker`

- Type: `boolean`
- Optional
- Defaults to `false`.
- If `true`, navigation will ignore any blockers that might prevent it.

### `reloadDocument`

- Type: `boolean`
- Optional
- Defaults to `false`.
- If `true`, navigation to a route inside of router will trigger a full page load instead of the traditional SPA navigation.

### `href`

- Type: `string`
- Optional
- This can be used instead of `to` to navigate to a fully built href, e.g. pointing to an external target.

- [`ToOptions`](../ToOptionsType.md)

# NotFoundError

The `NotFoundError` type is used to represent a not-found error in TanStack Router.

```tsx
export type NotFoundError = {
  global?: boolean
  data?: any
  throw?: boolean
  routeId?: string
}
```

## NotFoundError properties

The `NotFoundError` object accepts/contains the following properties:

### `data` property

- Type: `any`
- Optional
- Custom data that is passed into to `notFoundComponent` when the not-found error is handled

### `global` property

- Type: `boolean`
- Optional - `default: false`
- If true, the not-found error will be handled by the `notFoundComponent` of the root route instead of bubbling up from the route that threw it. This has the same behavior as importing the root route and calling `RootRoute.notFound()`.

### `route` property

- Type: `string`
- Optional
- The ID of the route that will attempt to handle the not-found error. If the route does not have a `notFoundComponent`, the error will bubble up to the parent route (and be handled by the root route if necessary). By default, TanStack Router will attempt to handle the not-found error with the route that threw it.

### `throw` property

- Type: `boolean`
- Optional - `default: false`
- If provided, will throw the not-found object instead of returning it. This can be useful in places where `throwing` in a function might cause it to have a return type of `never`. In that case, you can use `notFound({ throw: true })` to throw the not-found object instead of returning it.

# NotFoundRoute class

> [!CAUTION]
> This class has been deprecated and will be removed in the next major version of TanStack Router.
> Please use the `notFoundComponent` route option that is present during route configuration.
> See the [Not Found Errors guide](../../../guide/not-found-errors.md) for more information.

The `NotFoundRoute` class extends the `Route` class and can be used to create a not found route instance. A not found route instance can be passed to the `routerOptions.notFoundRoute` option to configure a default not-found/404 route for every branch of the route tree.

## Constructor options

The `NotFoundRoute` constructor accepts an object as its only argument.

- Type:

```tsx
Omit<
  RouteOptions,
  | 'path'
  | 'id'
  | 'getParentRoute'
  | 'caseSensitive'
  | 'parseParams'
  | 'stringifyParams'
>
```

- [RouteOptions](../RouteOptionsType.md)
- Required
- The options that will be used to configure the not found route instance.

## Examples

```tsx
import { NotFoundRoute, createRouter } from '@tanstack/react-router'
import { Route as rootRoute } from './routes/__root'
import { routeTree } from './routeTree.gen'

const notFoundRoute = new NotFoundRoute({
  getParentRoute: () => rootRoute,
  component: () => <div>Not found!!!</div>,
})

const router = createRouter({
  routeTree,
  notFoundRoute,
})

// ... other code
```

# ParsedHistoryState type

The `ParsedHistoryState` type represents a parsed state object. Additionally to `HistoryState`, it contains the index and the unique key of the route.

```tsx
export type ParsedHistoryState = HistoryState & {
  key?: string
  __TSR_index: number
}
```

# ParsedLocation type

The `ParsedLocation` type represents a parsed location in TanStack Router. It contains a lot of useful information about the current location, including the pathname, search params, hash, location state, and route masking information.

```tsx
interface ParsedLocation {
  href: string
  pathname: string
  search: TFullSearchSchema
  searchStr: string
  state: ParsedHistoryState
  hash: string
  maskedLocation?: ParsedLocation
  unmaskOnReload?: boolean
}
```

# Redirect type

The `Redirect` type is used to represent a redirect action in TanStack Router.

```tsx
export type Redirect = {
  statusCode?: number
  throw?: any
  headers?: HeadersInit
} & NavigateOptions
```

- [`NavigateOptions`](../NavigateOptionsType.md)

## Redirect properties

The `Redirect` object accepts/contains the following properties:

### `statusCode` property

- Type: `number`
- Optional
- The HTTP status code to use when redirecting

### `throw` property

- Type: `any`
- Optional
- If provided, will throw the redirect object instead of returning it. This can be useful in places where `throwing` in a function might cause it to have a return type of `never`. In that case, you can use `redirect({ throw: true })` to throw the redirect object instead of returning it.

### `headers` property

- Type: `HeadersInit`
- Optional
- The HTTP headers to use when redirecting.

# Register type

This type is used to register a route tree with a router instance. Doing so unlocks the full type safety of TanStack Router, including top-level exports from the `@tanstack/react-router` package.

```tsx
export type Register = {
  // router: [Your router type here]
}
```

To register a route tree with a router instance, use declaration merging to add the type of your router instance to the Register interface under the `router` property:

## Examples

```tsx
const router = createRouter({
  // ...
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```

# RootRoute class

> [!CAUTION]
> This class has been deprecated and will be removed in the next major version of TanStack Router.
> Please use the [`createRootRoute`](../createRootRouteFunction.md) function instead.

The `RootRoute` class extends the `Route` class and can be used to create a root route instance. A root route instance can then be used to create a route tree.

## `RootRoute` constructor

The `RootRoute` constructor accepts an object as its only argument.

### Constructor options

The options that will be used to configure the root route instance.

- Type:

```tsx
Omit<
  RouteOptions,
  | 'path'
  | 'id'
  | 'getParentRoute'
  | 'caseSensitive'
  | 'parseParams'
  | 'stringifyParams'
>
```

- [`RouteOptions`](../RouteOptionsType.md)
- Optional

## Constructor returns

A new [`Route`](../RouteType.md) instance.

## Examples

```tsx
import { RootRoute, createRouter, Outlet } from '@tanstack/react-router'

const rootRoute = new RootRoute({
  component: () => <Outlet />,
  // ... root route options
})

const routeTree = rootRoute.addChildren([
  // ... other routes
])

const router = createRouter({
  routeTree,
})
```

# RouteApi class

> [!CAUTION]
> This class has been deprecated and will be removed in the next major version of TanStack Router.
> Please use the [`getRouteApi`](../getRouteApiFunction.md) function instead.

The `RouteApi` class provides type-safe version of common hooks like `useParams`, `useSearch`, `useRouteContext`, `useNavigate`, `useLoaderData`, and `useLoaderDeps` that are pre-bound to a specific route ID and corresponding registered route types.

## Constructor options

The `RouteApi` constructor accepts a single argument: the `options` that will be used to configure the `RouteApi` instance.

### `opts.routeId` option

- Type: `string`
- Required
- The route ID to which the `RouteApi` instance will be bound

## Constructor returns

- An instance of the [`RouteApi`](../RouteApiType.md) that is pre-bound to the route ID that it was called with.

## Examples

```tsx
import { RouteApi } from '@tanstack/react-router'

const routeApi = new RouteApi({ id: '/posts' })

export function PostsPage() {
  const posts = routeApi.useLoaderData()
  // ...
}
```

# RouteApi Type

The `RouteApi` describes an instance that provides type-safe versions of common hooks like `useParams`, `useSearch`, `useRouteContext`, `useNavigate`, `useLoaderData`, and `useLoaderDeps` that are pre-bound to a specific route ID and corresponding registered route types.

## `RouteApi` properties and methods

The `RouteApi` has the following properties and methods:

### `useMatch` method

```tsx
  useMatch<TSelected = TAllContext>(opts?: {
    select?: (match: TAllContext) => TSelected
  }): TSelected
```

- A type-safe version of the [`useMatch`](../useMatchHook.md) hook that is pre-bound to the route ID that the `RouteApi` instance was created with.
- Options
  - `opts.select`
    - Optional
    - `(match: RouteMatch) => TSelected`
    - If supplied, this function will be called with the route match and the return value will be returned from `useMatch`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.
  - `opts.structuralSharing`
    - Optional
    - `boolean`
    - Configures whether structural sharing is enabled for the value returned by `select`.
    - See the [Render Optimizations guide](../../../guide/render-optimizations.md) for more information.
- Returns
  - If a `select` function is provided, the return value of the `select` function.
  - If no `select` function is provided, the `RouteMatch` object or a loosened version of the `RouteMatch` object if `opts.strict` is `false`.

### `useRouteContext` method

```tsx
  useRouteContext<TSelected = TAllContext>(opts?: {
    select?: (search: TAllContext) => TSelected
  }): TSelected
```

- A type-safe version of the [`useRouteContext`](../useRouteContextHook.md) hook that is pre-bound to the route ID that the `RouteApi` instance was created with.
- Options
  - `opts.select`
    - Optional
    - `(match: RouteContext) => TSelected`
    - If supplied, this function will be called with the route match and the return value will be returned from `useRouteContext`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.
- Returns
  - If a `select` function is provided, the return value of the `select` function.
  - If no `select` function is provided, the `RouteContext` object or a loosened version of the `RouteContext` object if `opts.strict` is `false`.

### `useSearch` method

```tsx
  useSearch<TSelected = TFullSearchSchema>(opts?: {
    select?: (search: TFullSearchSchema) => TSelected
  }): TSelected
```

- A type-safe version of the [`useSearch`](../useSearchHook.md) hook that is pre-bound to the route ID that the `RouteApi` instance was created with.
- Options
  - `opts.select`
    - Optional
    - `(match: TFullSearchSchema) => TSelected`
    - If supplied, this function will be called with the route match and the return value will be returned from `useSearch`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.
  - `opts.structuralSharing`
    - Optional
    - `boolean`
    - Configures whether structural sharing is enabled for the value returned by `select`.
    - See the [Render Optimizations guide](../../../guide/render-optimizations.md) for more information.
- Returns
  - If a `select` function is provided, the return value of the `select` function.
  - If no `select` function is provided, the `TFullSearchSchema` object or a loosened version of the `TFullSearchSchema` object if `opts.strict` is `false`.

### `useParams` method

```tsx
  useParams<TSelected = TAllParams>(opts?: {
    select?: (params: TAllParams) => TSelected
  }): TSelected
```

- A type-safe version of the [`useParams`](../useParamsHook.md) hook that is pre-bound to the route ID that the `RouteApi` instance was created with.
- Options
  - `opts.select`
    - Optional
    - `(match: TAllParams) => TSelected`
    - If supplied, this function will be called with the route match and the return value will be returned from `useParams`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.
  - `opts.structuralSharing`
    - Optional
    - `boolean`
    - Configures whether structural sharing is enabled for the value returned by `select`.
    - See the [Render Optimizations guide](../../../guide/render-optimizations.md) for more information.
- Returns
  - If a `select` function is provided, the return value of the `select` function.
  - If no `select` function is provided, the `TAllParams` object or a loosened version of the `TAllParams` object if `opts.strict` is `false`.

### `useLoaderData` method

```tsx
  useLoaderData<TSelected = TLoaderData>(opts?: {
    select?: (search: TLoaderData) => TSelected
  }): TSelected
```

- A type-safe version of the [`useLoaderData`](../useLoaderDataHook.md) hook that is pre-bound to the route ID that the `RouteApi` instance was created with.
- Options
  - `opts.select`
    - Optional
    - `(match: TLoaderData) => TSelected`
    - If supplied, this function will be called with the route match and the return value will be returned from `useLoaderData`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.
  - `opts.structuralSharing`
    - Optional
    - `boolean`
    - Configures whether structural sharing is enabled for the value returned by `select`.
    - See the [Render Optimizations guide](../../../guide/render-optimizations.md) for more information.
- Returns
  - If a `select` function is provided, the return value of the `select` function.
  - If no `select` function is provided, the `TLoaderData` object or a loosened version of the `TLoaderData` object if `opts.strict` is `false`.

### `useLoaderDeps` method

```tsx
  useLoaderDeps<TSelected = TLoaderDeps>(opts?: {
    select?: (search: TLoaderDeps) => TSelected
  }): TSelected
```

- A type-safe version of the [`useLoaderDeps`](../useLoaderDepsHook.md) hook that is pre-bound to the route ID that the `RouteApi` instance was created with.
- Options
  - `opts.select`
    - Optional
    - `(match: TLoaderDeps) => TSelected`
    - If supplied, this function will be called with the route match and the return value will be returned from `useLoaderDeps`.
  - `opts.structuralSharing`
    - Optional
    - `boolean`
    - Configures whether structural sharing is enabled for the value returned by `select`.
    - See the [Render Optimizations guide](../../../guide/render-optimizations.md) for more information.
- Returns
  - If a `select` function is provided, the return value of the `select` function.
  - If no `select` function is provided, the `TLoaderDeps` object.

### `useNavigate` method

```tsx
  useNavigate(): // navigate function
```

- A type-safe version of [`useNavigate`](../useNavigateHook.md) that is pre-bound to the route ID that the `RouteApi` instance was created with.

# Route class

> [!CAUTION]
> This class has been deprecated and will be removed in the next major version of TanStack Router.
> Please use the [`createRoute`](../createRouteFunction.md) function instead.

The `Route` class implements the `RouteApi` class and can be used to create route instances. A route instance can then be used to create a route tree.

## `Route` constructor

The `Route` constructor accepts an object as its only argument.

### Constructor options

- Type: [`RouteOptions`](../RouteOptionsType.md)
- Required
- The options that will be used to configure the route instance

### Constructor returns

A new [`Route`](../RouteType.md) instance.

## Examples

```tsx
import { Route } from '@tanstack/react-router'
import { rootRoute } from './__root'

const indexRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/',
  loader: () => {
    return 'Hello World'
  },
  component: IndexComponent,
})

function IndexComponent() {
  const data = indexRoute.useLoaderData()
  return <div>{data}</div>
}
```

# RouteMask type

The `RouteMask` type extends the [`ToOptions`](../ToOptionsType.md) type and has other the necessary properties to create a route mask.

## RouteMask properties

The `RouteMask` type accepts an object with the following properties:

### `...ToOptions`

- Type: [`ToOptions`](../ToOptionsType.md)
- Required
- The options that will be used to configure the route mask

### `options.routeTree`

- Type: `TRouteTree`
- Required
- The route tree that this route mask will support

### `options.unmaskOnReload`

- Type: `boolean`
- Optional
- If `true`, the route mask will be removed when the page is reloaded

# RouteMatch type

The `RouteMatch` type represents a route match in TanStack Router.

```tsx
interface RouteMatch {
  id: string
  routeId: string
  pathname: string
  params: Route['allParams']
  status: 'pending' | 'success' | 'error'
  isFetching: boolean
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
  cause: 'enter' | 'stay'
}
```

# RouteOptions type

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

### `stringifyParams` method (⚠️ deprecated, use `params.stringify` instead)

- Type: `(params: TParams) => Record<string, string>`
- Required if `parseParams` is provided
- A function that will be called when this route's parsed params are being used to build a location. This function should return a valid object of `Record<string, string>` mapping.

### `params.parse` method

- Type: `(rawParams: Record<string, string>) => TParams`
- Optional
- A function that will be called when this route is matched and passed the raw params from the current location and return valid parsed params. If this function throws, the route will be put into an error state and the error will be thrown during render. If this function does not throw, its return value will be used as the route's params and the return type will be inferred into the rest of the router.

### `params.stringify` method

- Type: `(params: TParams) => Record<string, string>`
- A function that will be called when this route's parsed params are being used to build a location. This function should return a valid object of `Record<string, string>` mapping.

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
- [`ParsedLocation`](../ParsedLocationType.md)
- This async function is called before a route is loaded. If an error is thrown here, the route's loader will not be called and the route will not render. If thrown during a navigation, the navigation will be canceled and the error will be passed to the `onError` function. If thrown during a preload event, the error will be logged to the console and the preload will fail.
- If this function returns a promise, the route will be put into a pending state and cause rendering to suspend until the promise resolves. If this route's pendingMs threshold is reached, the `pendingComponent` will be shown until it resolves. If the promise rejects, the route will be put into an error state and the error will be thrown during render.
- If this function returns a `TRouteContext` object, that object will be merged into the route's context and be made available in the `loader` and other related route components/methods.
- It's common to use this function to check if a user is authenticated and redirect them to a login page if they are not. To do this, you can either return or throw a `redirect` object from this function.

> 🚧 `opts.navigate` has been deprecated and will be removed in the next major release. Use `throw redirect({ to: '/somewhere' })` instead. Read more about the `redirect` function [here](../redirectFunction.md).

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
- [`ParsedLocation`](../ParsedLocationType.md)
- This async function is called when a route is matched and passed the route's match object. If an error is thrown here, the route will be put into an error state and the error will be thrown during render. If thrown during a navigation, the navigation will be canceled and the error will be passed to the `onError` function. If thrown during a preload event, the error will be logged to the console and the preload will fail.
- If this function returns a promise, the route will be put into a pending state and cause rendering to suspend until the promise resolves. If this route's pendingMs threshold is reached, the `pendingComponent` will be shown until it resolves. If the promise rejects, the route will be put into an error state and the error will be thrown during render.
- If this function returns a `TLoaderData` object, that object will be stored on the route match until the route match is no longer active. It can be accessed using the `useLoaderData` hook in any component that is a child of the route match before another `<Outlet />` is rendered.

> 🚧 `opts.navigate` has been deprecated and will be removed in the next major release. Use `throw redirect({ to: '/somewhere' })` instead. Read more about the `redirect` function [here](../redirectFunction.md).

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

### `preloadMaxAge` property

- Type: `number`
- Optional
- Defaults to `30_000` ms (30 seconds)
- The maximum amount of time in milliseconds that a route's preloaded route data will be cached for. If a route is not matched within this time frame, its loader data will be discarded.

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
- If this function throws a [`redirect`](../redirectFunction.md), then the router will process and apply the redirect immediately.

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

# Route type

The `Route` type is used to describe a route instance.

## `Route` properties and methods

An instance of the `Route` has the following properties and methods:

### `.addChildren` method

- Type: `(children: Route[]) => this`
- Adds child routes to the route instance and returns the route instance (but with updated types to reflect the new children).

### `.update` method

- Type: `(options: Partial<UpdatableRouteOptions>) => this`
- Updates the route instance with new options and returns the route instance (but with updated types to reflect the new options).
- In some circumstances, it can be useful to update a route instance's options after it has been created to avoid circular type references.
- ...`RouteApi` methods

### `.lazy` method

- Type: `(lazyImporter: () => Promise<Partial<UpdatableRouteOptions>>) => this`
- Updates the route instance with a new lazy importer which will be resolved lazily when loading the route. This can be useful for code splitting.

### ...`RouteApi` methods

- All of the methods from [`RouteApi`](../RouteApiType.md) are available.

# Router Class

> [!CAUTION]
> This class has been deprecated and will be removed in the next major version of TanStack Router.
> Please use the [`createRouter`](../createRouterFunction.md) function instead.

The `Router` class is used to instantiate a new router instance.

## `Router` constructor

The `Router` constructor accepts a single argument: the `options` that will be used to configure the router instance.

### Constructor options

- Type: [`RouterOptions`](../RouterOptionsType.md)
- Required
- The options that will be used to configure the router instance.

### Constructor returns

- An instance of the [`Router`](../RouterType.md).

## Examples

```tsx
import { Router, RouterProvider } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

const router = new Router({
  routeTree,
  defaultPreload: 'intent',
})

export default function App() {
  return <RouterProvider router={router} />
}
```

# RouterEvents type

The `RouterEvents` type contains all of the events that the router can emit. Each top-level key of this type, represents the name of an event that the router can emit. The values of the keys are the event payloads.

```tsx
type RouterEvents = {
  onBeforeNavigate: {
    type: 'onBeforeNavigate'
    fromLocation?: ParsedLocation
    toLocation: ParsedLocation
    pathChanged: boolean
    hrefChanged: boolean
  }
  onBeforeLoad: {
    type: 'onBeforeLoad'
    fromLocation?: ParsedLocation
    toLocation: ParsedLocation
    pathChanged: boolean
    hrefChanged: boolean
  }
  onLoad: {
    type: 'onLoad'
    fromLocation?: ParsedLocation
    toLocation: ParsedLocation
    pathChanged: boolean
    hrefChanged: boolean
  }
  onResolved: {
    type: 'onResolved'
    fromLocation?: ParsedLocation
    toLocation: ParsedLocation
    pathChanged: boolean
    hrefChanged: boolean
  }
  onBeforeRouteMount: {
    type: 'onBeforeRouteMount'
    fromLocation?: ParsedLocation
    toLocation: ParsedLocation
    pathChanged: boolean
    hrefChanged: boolean
  }
  onInjectedHtml: {
    type: 'onInjectedHtml'
    promise: Promise<string>
  }
  onRendered: {
    type: 'onRendered'
    fromLocation?: ParsedLocation
    toLocation: ParsedLocation
  }
}
```

## RouterEvents properties

Once an event is emitted, the following properties will be present on the event payload.

### `type` property

- Type: `onBeforeNavigate | onBeforeLoad | onLoad | onBeforeRouteMount | onResolved`
- The type of the event
- This is useful for discriminating between events in a listener function.

### `fromLocation` property

- Type: [`ParsedLocation`](../ParsedLocationType.md)
- The location that the router is transitioning from.

### `toLocation` property

- Type: [`ParsedLocation`](../ParsedLocationType.md)
- The location that the router is transitioning to.

### `pathChanged` property

- Type: `boolean`
- `true` if the path has changed between the `fromLocation` and `toLocation`.

### `hrefChanged` property

- Type: `boolean`
- `true` if the href has changed between the `fromLocation` and `toLocation`.

## Example

```tsx
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

const router = createRouter({ routeTree })

const unsub = router.subscribe('onResolved', (evt) => {
  // ...
})
```

# RouterOptions

The `RouterOptions` type contains all of the options that can be used to configure a router instance.

## RouterOptions properties

The `RouterOptions` type accepts an object with the following properties and methods:

### `routeTree` property

- Type: `AnyRoute`
- Required
- The route tree that will be used to configure the router instance.

### `history` property

- Type: `RouterHistory`
- Optional
- The history object that will be used to manage the browser history. If not provided, a new `createBrowserHistory` instance will be created and used.

### `stringifySearch` method

- Type: `(search: Record<string, any>) => string`
- Optional
- A function that will be used to stringify search params when generating links.
- Defaults to `defaultStringifySearch`.

### `parseSearch` method

- Type: `(search: string) => Record<string, any>`
- Optional
- A function that will be used to parse search params when parsing the current location.
- Defaults to `defaultParseSearch`.

### `search.strict` property

- Type: `boolean`
- Optional
- Defaults to `false`
- Configures how unknown search params (= not returned by any `validateSearch`) are treated.
- If `false`, unknown search params will be kept.
- If `true`, unknown search params will be removed.

### `defaultPreload` property

- Type: `undefined | false | 'intent' | 'viewport' | 'render'`
- Optional
- Defaults to `false`
- If `false`, routes will not be preloaded by default in any way.
- If `'intent'`, routes will be preloaded by default when the user hovers over a link or a `touchstart` event is detected on a `<Link>`.
- If `'viewport'`, routes will be preloaded by default when they are within the viewport of the browser.
- If `'render'`, routes will be preloaded by default as soon as they are rendered in the DOM.

### `defaultPreloadDelay` property

- Type: `number`
- Optional
- Defaults to `50`
- The delay in milliseconds that a route must be hovered over or touched before it is preloaded.

### `defaultComponent` property

- Type: `RouteComponent`
- Optional
- Defaults to `Outlet`
- The default `component` a route should use if no component is provided.

### `defaultErrorComponent` property

- Type: `RouteComponent`
- Optional
- Defaults to `ErrorComponent`
- The default `errorComponent` a route should use if no error component is provided.

### `defaultNotFoundComponent` property

- Type: `NotFoundRouteComponent`
- Optional
- Defaults to `NotFound`
- The default `notFoundComponent` a route should use if no notFound component is provided.

### `defaultPendingComponent` property

- Type: `RouteComponent`
- Optional
- The default `pendingComponent` a route should use if no pending component is provided.

### `defaultPendingMs` property

- Type: `number`
- Optional
- Defaults to `1000`
- The default `pendingMs` a route should use if no pendingMs is provided.

### `defaultPendingMinMs` property

- Type: `number`
- Optional
- Defaults to `500`
- The default `pendingMinMs` a route should use if no pendingMinMs is provided.

### `defaultStaleTime` property

- Type: `number`
- Optional
- Defaults to `0`
- The default `staleTime` a route should use if no staleTime is provided.

### `defaultPreloadStaleTime` property

- Type: `number`
- Optional
- Defaults to `30_000` ms (30 seconds)
- The default `preloadStaleTime` a route should use if no preloadStaleTime is provided.

### `defaultPreloadGcTime` property

- Type: `number`
- Optional
- Defaults to `routerOptions.defaultGcTime`, which defaults to 30 minutes.
- The default `preloadGcTime` a route should use if no preloadGcTime is provided.

### `defaultGcTime` property

- Type: `number`
- Optional
- Defaults to 30 minutes.
- The default `gcTime` a route should use if no gcTime is provided.

### `defaultOnCatch` property

- Type: `(error: Error, errorInfo: ErrorInfo) => void`
- Optional
- The default `onCatch` handler for errors caught by the Router ErrorBoundary

### `defaultViewTransition` property

- Type: `boolean | ViewTransitionOptions`
- Optional
- If `true`, route navigations will be called using `document.startViewTransition()`.
- If [`ViewTransitionOptions`](../ViewTransitionOptionsType.md), route navigations will be called using `document.startViewTransition({update, types})`
  where `types` will be the strings array passed with `ViewTransitionOptions["types"]`. If the browser does not support viewTransition types,
  the navigation will fall back to normal `document.startTransition()`, same as if `true` was passed.
- If the browser does not support this api, this option will be ignored.
- See [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition) for more information on how this function works.
- See [Google](https://developer.chrome.com/docs/web-platform/view-transitions/same-document#view-transition-types) for more information on viewTransition types

### `defaultHashScrollIntoView` property

- Type: `boolean | ScrollIntoViewOptions`
- Optional
- Defaults to `true` so the element with an id matching the hash will be scrolled into view after the location is committed to history.
- If `false`, the element with an id matching the hash will not be scrolled into view after the location is committed to history.
- If an object is provided, it will be passed to the `scrollIntoView` method as options.
- See [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView) for more information on `ScrollIntoViewOptions`.

### `caseSensitive` property

- Type: `boolean`
- Optional
- Defaults to `false`
- If `true`, all routes will be matched as case-sensitive.

### `basepath` property

- Type: `string`
- Optional
- Defaults to `/`
- The basepath for then entire router. This is useful for mounting a router instance at a subpath.

### `context` property

- Type: `any`
- Optional or required if the root route was created with [`createRootRouteWithContext()`](../createRootRouteWithContextFunction.md).
- The root context that will be provided to all routes in the route tree. This can be used to provide a context to all routes in the tree without having to provide it to each route individually.

### `dehydrate` method

- Type: `() => TDehydrated`
- Optional
- A function that will be called when the router is dehydrated. The return value of this function will be serialized and stored in the router's dehydrated state.

### `hydrate` method

- Type: `(dehydrated: TDehydrated) => void`
- Optional
- A function that will be called when the router is hydrated. The return value of this function will be serialized and stored in the router's dehydrated state.

### `routeMasks` property

- Type: `RouteMask[]`
- Optional
- An array of route masks that will be used to mask routes in the route tree. Route masking is when you display a route at a different path than the one it is configured to match, like a modal popup that when shared will unmask to the modal's content instead of the modal's context.

### `unmaskOnReload` property

- Type: `boolean`
- Optional
- Defaults to `false`
- If `true`, route masks will, by default, be removed when the page is reloaded. This can be overridden on a per-mask basis by setting the `unmaskOnReload` option on the mask, or on a per-navigation basis by setting the `unmaskOnReload` option in the `Navigate` options.

### `Wrap` property

- Type: `React.Component`
- Optional
- A component that will be used to wrap the entire router. This is useful for providing a context to the entire router. Only non-DOM-rendering components like providers should be used, anything else will cause a hydration error.

**Example**

```tsx
import { createRouter } from '@tanstack/react-router'

const router = createRouter({
  // ...
  Wrap: ({ children }) => {
    return <MyContext.Provider value={myContext}>{children}</MyContext>
  },
})
```

### `InnerWrap` property

- Type: `React.Component`
- Optional
- A component that will be used to wrap the inner contents of the router. This is useful for providing a context to the inner contents of the router where you also need access to the router context and hooks. Only non-DOM-rendering components like providers should be used, anything else will cause a hydration error.

**Example**

```tsx
import { createRouter } from '@tanstack/react-router'

const router = createRouter({
  // ...
  InnerWrap: ({ children }) => {
    const routerState = useRouterState()

    return (
      <MyContext.Provider value={myContext}>
        {children}
      </MyContext>
    )
  },
})
```

### `notFoundMode` property

- Type: `'root' | 'fuzzy'`
- Optional
- Defaults to `'fuzzy'`
- This property controls how TanStack Router will handle scenarios where it cannot find a route to match the current location. See the [Not Found Errors guide](../../../guide/not-found-errors.md) for more information.

### `notFoundRoute` property

- **Deprecated**
- Type: `NotFoundRoute`
- Optional
- A route that will be used as the default not found route for every branch of the route tree. This can be overridden on a per-branch basis by providing a not found route to the `NotFoundRoute` option on the root route of the branch.

### `errorSerializer` property

- Type: [`RouterErrorSerializer`]
- Optional
- The serializer object that will be used to determine how errors are serialized and deserialized between the server and the client.

#### `errorSerializer.serialize` method

- Type: `(err: unknown) => TSerializedError`
- This method is called to define how errors are serialized when they are stored in the router's dehydrated state.

#### `errorSerializer.deserialize` method

- Type: `(err: TSerializedError) => unknown`
- This method is called to define how errors are deserialized from the router's dehydrated state.

### `trailingSlash` property

- Type: `'always' | 'never' | 'preserve'`
- Optional
- Defaults to `never`
- Configures how trailing slashes are treated. `'always'` will add a trailing slash if not present, `'never'` will remove the trailing slash if present and `'preserve'` will not modify the trailing slash.

### `pathParamsAllowedCharacters` property

- Type: `Array<';' | ':' | '@' | '&' | '=' | '+' | '$' | ','>`
- Optional
- Configures which URI characters are allowed in path params that would ordinarily be escaped by encodeURIComponent.

### `defaultStructuralSharing` property

- Type: `boolean`
- Optional
- Defaults to `false`
- Configures whether structural sharing is enabled by default for fine-grained selectors.
- See the [Render Optimizations guide](../../../guide/render-optimizations.md) for more information.

### `defaultRemountDeps` property

- Type:

```tsx
type defaultRemountDeps = (opts: RemountDepsOptions) => any

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
- A default function that will be called to determine whether a route component shall be remounted after navigation. If this function returns a different value than previously, it will remount.
- The return value needs to be JSON serializable.
- By default, a route component will not be remounted if it stays active after a navigation

Example:  
If you want to configure to remount all route components upon `params` change, use:

```tsx
remountDeps: ({ params }) => params
```

# RouterState type

The `RouterState` type represents shape of the internal state of the router. The Router's internal state is useful, if you need to access certain internals of the router, such as any pending matches, is the router in its loading state, etc.

```tsx
type RouterState = {
  status: 'pending' | 'idle'
  isLoading: boolean
  isTransitioning: boolean
  matches: Array<RouteMatch>
  pendingMatches: Array<RouteMatch>
  location: ParsedLocation
  resolvedLocation: ParsedLocation
}
```

## RouterState properties

The `RouterState` type contains all of the properties that are available on the router state.

### `status` property

- Type: `'pending' | 'idle'`
- The current status of the router. If the router is pending, it means that it is currently loading a route or the router is still transitioning to the new route.

### `isLoading` property

- Type: `boolean`
- `true` if the router is currently loading a route or waiting for a route to finish loading.

### `isTransitioning` property

- Type: `boolean`
- `true` if the router is currently transitioning to a new route.

### `matches` property

- Type: [`Array<RouteMatch>`](../RouteMatchType.md)
- An array of all of the route matches that have been resolved and are currently active.

### `pendingMatches` property

- Type: [`Array<RouteMatch>`](../RouteMatchType.md)
- An array of all of the route matches that are currently pending.

### `location` property

- Type: [`ParsedLocation`](../ParsedLocationType.md)
- The latest location that the router has parsed from the browser history. This location may not be resolved and loaded yet.

### `resolvedLocation` property

- Type: [`ParsedLocation`](../ParsedLocationType.md)
- The location that the router has resolved and loaded.

# Router type

The `Router` type is used to describe a router instance.

## `Router` properties and methods

An instance of the `Router` has the following properties and methods:

### `.update` method

- Type: `(newOptions: RouterOptions) => void`
- Updates the router instance with new options.

### `state` property

- Type: [`RouterState`](../RouterStateType.md)
- The current state of the router.

> ⚠️⚠️⚠️ **`router.state` is always up to date, but NOT REACTIVE. If you use `router.state` in a component, the component will not re-render when the router state changes. To get a reactive version of the router state, use the [`useRouterState`](../useRouterStateHook.md) hook.**

### `.subscribe` method

- Type: `(eventType: TType, fn: ListenerFn<RouterEvents[TType]>) => (event: RouterEvent) => void`
- Subscribes to a [`RouterEvent`](../RouterEventsType.md).
- Returns a function that can be used to unsubscribe from the event.
- The callback provided to the returned function will be called with the event that was emitted.

### `.matchRoutes` method

- Type: `(pathname: string, locationSearch: Record<string, any>, opts?: { throwOnError?: boolean; }) => RouteMatch[]`
- Matches a pathname and search params against the router's route tree and returns an array of route matches.
- If `opts.throwOnError` is `true`, any errors that occur during the matching process will be thrown (in addition to being returned in the route match's `error` property).

### `.cancelMatch` method

- Type: `(matchId: string) => void`
- Cancels a route match that is currently pending by calling `match.abortController.abort()`.

### `.cancelMatches` method

- Type: `() => void`
- Cancels all route matches that are currently pending by calling `match.abortController.abort()` on each one.

### `.buildLocation` method

Builds a new parsed location object that can be used later to navigate to a new location.

- Type: `(opts: BuildNextOptions) => ParsedLocation`
- Properties
  - `from`
    - Type: `string`
    - Optional
    - The path to navigate from. If not provided, the current path will be used.
  - `to`
    - Type: `string | number | null`
    - Optional
    - The path to navigate to. If `null`, the current path will be used.
  - `params`
    - Type: `true | Updater<unknown>`
    - Optional
    - If `true`, the current params will be used. If a function is provided, it will be called with the current params and the return value will be used.
  - `search`
    - Type: `true | Updater<unknown>`
    - Optional
    - If `true`, the current search params will be used. If a function is provided, it will be called with the current search params and the return value will be used.
  - `hash`
    - Type: `true | Updater<string>`
    - Optional
    - If `true`, the current hash will be used. If a function is provided, it will be called with the current hash and the return value will be used.
  - `state`
    - Type: `true | NonNullableUpdater<ParsedHistoryState, HistoryState>`
    - Optional
    - If `true`, the current state will be used. If a function is provided, it will be called with the current state and the return value will be used.
  - `mask`
    - Type: `object`
    - Optional
    - Contains all of the same BuildNextOptions, with the addition of `unmaskOnReload`.
    - `unmaskOnReload`
      - Type: `boolean`
      - Optional
      - If `true`, the route mask will be removed when the page is reloaded. This can be overridden on a per-navigation basis by setting the `unmaskOnReload` option in the `Navigate` options.

### `.commitLocation` method

Commits a new location object to the browser history.

- Type
  ```tsx
  type commitLocation = (
    location: ParsedLocation & {
      replace?: boolean
      resetScroll?: boolean
      hashScrollIntoView?: boolean | ScrollIntoViewOptions
      ignoreBlocker?: boolean
    },
  ) => Promise<void>
  ```
- Properties
  - `location`
    - Type: [`ParsedLocation`](../ParsedLocationType.md)
    - Required
    - The location to commit to the browser history.
  - `replace`
    - Type: `boolean`
    - Optional
    - Defaults to `false`.
    - If `true`, the location will be committed to the browser history using `history.replace` instead of `history.push`.
  - `resetScroll`
    - Type: `boolean`
    - Optional
    - Defaults to `true` so that the scroll position will be reset to 0,0 after the location is committed to the browser history.
    - If `false`, the scroll position will not be reset to 0,0 after the location is committed to history.
  - `hashScrollIntoView`
    - Type: `boolean | ScrollIntoViewOptions`
    - Optional
    - Defaults to `true` so the element with an id matching the hash will be scrolled into view after the location is committed to history.
    - If `false`, the element with an id matching the hash will not be scrolled into view after the location is committed to history.
    - If an object is provided, it will be passed to the `scrollIntoView` method as options.
    - See [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView) for more information on `ScrollIntoViewOptions`.
  - `ignoreBlocker`
    - Type: `boolean`
    - Optional
    - Defaults to `false`.
    - If `true`, navigation will ignore any blockers that might prevent it.

### `.navigate` method

Navigates to a new location.

- Type
  ```tsx
  type navigate = (options: NavigateOptions) => Promise<void>
  ```

### `.invalidate` method

Invalidates route matches by forcing their `beforeLoad` and `load` functions to be called again.

- Type: `(opts?: {filter?: (d: MakeRouteMatchUnion<TRouter>) => boolean, sync?: boolean}) => Promise<void>`
- This is useful any time your loader data might be out of date or stale. For example, if you have a route that displays a list of posts, and you have a loader function that fetches the list of posts from an API, you might want to invalidate the route matches for that route any time a new post is created so that the list of posts is always up-to-date.
- if `filter` is not supplied, all matches will be invalidated
- if `filter` is supplied, only matches for which `filter` returns `true` will be invalidated.
- if `sync` is true, the promise returned by this function will only resolve once all loaders have finished.
- You might also want to invalidate the Router if you imperatively `reset` the router's `CatchBoundary` to trigger loaders again.

### `.clearCache` method

Remove cached route matches.

- Type: `(opts?: {filter?: (d: MakeRouteMatchUnion<TRouter>) => boolean}) => void`
- if `filter` is not supplied, all cached matches will be removed
- if `filter` is supplied, only matches for which `filter` returns `true` will be removed.

### `.load` method

Loads all of the currently matched route matches and resolves when they are all loaded and ready to be rendered.

> ⚠️⚠️⚠️ **`router.load()` respects `route.staleTime` and will not forcefully reload a route match if it is still fresh. If you need to forcefully reload a route match, use `router.invalidate()` instead.**

- Type: `(opts?: {sync?: boolean}) => Promise<void>`
- if `sync` is true, the promise returned by this function will only resolve once all loaders have finished.
- The most common use case for this method is to call it when doing SSR to ensure that all of the critical data for the current route is loaded before attempting to stream or render the application to the client.

### `.preloadRoute` method

Preloads all of the matches that match the provided `NavigateOptions`.

> ⚠️⚠️⚠️ **Preloaded route matches are not stored long-term in the router state. They are only stored until the next attempted navigation action.**

- Type: `(opts?: NavigateOptions) => Promise<RouteMatch[]>`
- Properties
  - `opts`
    - Type: `NavigateOptions`
    - Optional, defaults to the current location.
    - The options that will be used to determine which route matches to preload.
- Returns
  - A promise that resolves with an array of all of the route matches that were preloaded.

### `.loadRouteChunk` method

Loads the JS chunk of the route.

- Type: `(route: AnyRoute) => Promise<void>`

### `.matchRoute` method

Matches a pathname and search params against the router's route tree and returns a route match's params or false if no match was found.

- Type: `(dest: ToOptions, matchOpts?: MatchRouteOptions) => RouteMatch['params'] | false`
- Properties
  - `dest`
    - Type: `ToOptions`
    - Required
    - The destination to match against.
  - `matchOpts`
    - Type: `MatchRouteOptions`
    - Optional
    - Options that will be used to match the destination.
- Returns
  - A route match's params if a match was found.
  - `false` if no match was found.

### `.dehydrate` method

Dehydrates the router's critical state into a serializable object that can be sent to the client in an initial request.

- Type: `() => DehydratedRouter`
- Returns
  - A serializable object that contains the router's critical state.

### `.hydrate` method

Hydrates the router's critical state from a serializable object that was sent from the server in an initial request.

- Type: `(dehydrated: DehydratedRouter) => void`
- Properties
  - `dehydrated`
    - Type: `DehydratedRouter`
    - Required
    - The dehydrated router state that was sent from the server.

# ToMaskOptions type

The `ToMaskOptions` type extends the [`ToOptions`](../ToOptionsType.md) type and describes additional options available when using route masks.

```tsx
type ToMaskOptions = ToOptions & {
  unmaskOnReload?: boolean
}
```

- [`ToOptions`](../ToOptionsType.md)

# ToOptions type

The `ToOptions` type contains several properties that can be used to describe a router destination.

```tsx
type ToOptions = {
  from?: ValidRoutePath | string
  to?: ValidRoutePath | string
  hash?: true | string | ((prev?: string) => string)
  state?: true | HistoryState | ((prev: HistoryState) => HistoryState)
} & SearchParamOptions &
  PathParamOptions

type SearchParamOptions = {
  search?: true | TToSearch | ((prev: TFromSearch) => TToSearch)
}

type PathParamOptions = {
  path?: true | Record<string, TPathParam> | ((prev: TFromParams) => TToParams)
}
```

# UseMatchRouteOptions type

The `UseMatchRouteOptions` type extends the [`ToOptions`](../ToOptionsType.md) type and describes additional options available when using the [`useMatchRoute`](../useMatchRouteHook.md) hook.

```tsx
export type UseMatchRouteOptions = ToOptions & MatchRouteOptions
```

- [`ToOptions`](../ToOptionsType.md)
- [`MatchRouteOptions`](../MatchRouteOptionsType.md)

# ViewTransitionOptions type

The `ViewTransitionOptions` type is used to define a
[viewTransition type](https://developer.chrome.com/docs/web-platform/view-transitions/same-document#view-transition-types).

```tsx
interface ViewTransitionOptions {
  types: Array<string>
}
```

## ViewTransitionOptions properties

The `ViewTransitionOptions` type accepts an object with a single property:

### `types` property

- Type: `Array<string>`
- Required
- The types array that will be passed to the `document.startViewTransition({update, types}) call`;

# Await component

The `Await` component is a component that suspends until the provided promise is resolved or rejected.
This is only necessary for React 18.
If you are using React 19, you can use the `use()` hook instead.

## Await props

The `Await` component accepts the following props:

### `props.promise` prop

- Type: `Promise<T>`
- Required
- The promise to await.

### `props.children` prop

- Type: `(result: T) => React.ReactNode`
- Required
- A function that will be called with the resolved value of the promise.

## Await returns

- Throws an error if the promise is rejected.
- Suspends (throws a promise) if the promise is pending.
- Returns the resolved value of a deferred promise if the promise is resolved using `props.children` as the render function.

## Examples

```tsx
import { Await } from '@tanstack/react-router'

function Component() {
  const { deferredPromise } = route.useLoaderData()

  return (
    <Await promise={deferredPromise}>
      {(data) => <div>{JSON.stringify(data)}</div>}
    </Await>
  )
}
```

# CatchBoundary component

The `CatchBoundary` component is a component that catches errors thrown by its children, renders an error component and optionally calls the `onCatch` callback. It also accepts a `getResetKey` function that can be used to declaratively reset the component's state when the key changes.

## CatchBoundary props

The `CatchBoundary` component accepts the following props:

### `props.getResetKey` prop

- Type: `() => string`
- Required
- A function that returns a string that will be used to reset the component's state when the key changes.

### `props.children` prop

- Type: `React.ReactNode`
- Required
- The component's children to render when there is no error

### `props.errorComponent` prop

- Type: `React.ReactNode`
- Optional - [`default: ErrorComponent`](../errorComponentComponent.md)
- The component to render when there is an error.

### `props.onCatch` prop

- Type: `(error: any) => void`
- Optional
- A callback that will be called with the error that was thrown by the component's children.

## CatchBoundary returns

- Returns the component's children if there is no error.
- Returns the `errorComponent` if there is an error.

## Examples

```tsx
import { CatchBoundary } from '@tanstack/react-router'

function Component() {
  return (
    <CatchBoundary
      getResetKey={() => 'reset'}
      onCatch={(error) => console.error(error)}
    >
      <div>My Component</div>
    </CatchBoundary>
  )
}
```

# CatchNotFound Component

The `CatchNotFound` component is a component that catches not-found errors thrown by its children, renders a fallback component and optionally calls the `onCatch` callback. It resets when the pathname changes.

## CatchNotFound props

The `CatchNotFound` component accepts the following props:

### `props.children` prop

- Type: `React.ReactNode`
- Required
- The component's children to render when there is no error

### `props.fallback` prop

- Type: `(error: NotFoundError) => React.ReactElement`
- Optional
- The component to render when there is an error

### `props.onCatch` prop

- Type: `(error: any) => void`
- Optional
- A callback that will be called with the error that was thrown by the component's children

## CatchNotFound returns

- Returns the component's children if there is no error.
- Returns the `fallback` if there is an error.

## Examples

```tsx
import { CatchNotFound } from '@tanstack/react-router'

function Component() {
  return (
    <CatchNotFound
      fallback={(error) => <p>Not found error! {JSON.stringify(error)}</p>}
    >
      <ComponentThatMightThrowANotFoundError />
    </CatchNotFound>
  )
}
```

# ClientOnly Component

The `ClientOnly` component is used to render a components only in the client, without breaking the server-side rendering due to hydration errors. It accepts a `fallback` prop that will be rendered if the JS is not yet loaded in the client.

## Props

The `ClientOnly` component accepts the following props:

### `props.fallback` prop

The fallback component to render if the JS is not yet loaded in the client.

### `props.children` prop

The component to render if the JS is loaded in the client.

## Returns

- Returns the component's children if the JS is loaded in the client.
- Returns the `fallback` component if the JS is not yet loaded in the client.

## Examples

```tsx
// src/routes/dashboard.tsx
import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import {
  Charts,
  FallbackCharts,
} from './charts-that-break-server-side-rendering'

export const Route = createFileRoute('/dashboard')({
  component: Dashboard,
  // ... other route options
})

function Dashboard() {
  return (
    <div>
      <p>Dashboard</p>
      <ClientOnly fallback={<FallbackCharts />}>
        <Charts />
      </ClientOnly>
    </div>
  )
}
```

# createFileRoute function

The `createFileRoute` function is a factory that can be used to create a file-based route instance. This route instance can then be used to automatically generate a route tree with the `tsr generate` and `tsr watch` commands.

## createFileRoute options

The `createFileRoute` function accepts a single argument of type `string` that represents the `path` of the file that the route will be generated from.

### `path` option

- Type: `string` literal
- Required, but **automatically inserted and updated by the `tsr generate` and `tsr watch` commands**
- The full path of the file that the route will be generated from

## createFileRoute returns

A new function that accepts a single argument of type [`RouteOptions`](../RouteOptionsType.md) that will be used to configure the file [`Route`](../RouteType.md) instance.

> ⚠️ Note: For `tsr generate` and `tsr watch` to work properly, the file route instance must be exported from the file using the `Route` identifier.

## Examples

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  loader: () => {
    return 'Hello World'
  },
  component: IndexComponent,
})

function IndexComponent() {
  const data = Route.useLoaderData()
  return <div>{data}</div>
}
```

# createLazyFileRoute function

The `createLazyFileRoute` function is used for creating a partial file-based route route instance that is lazily loaded when matched. This route instance can only be used to configure the [non-critical properties](../../../guide/code-splitting.md#how-does-tanstack-router-split-code) of the route, such as `component`, `pendingComponent`, `errorComponent`, and the `notFoundComponent`.

## createLazyFileRoute options

The `createLazyFileRoute` function accepts a single argument of type `string` that represents the `path` of the file that the route will be generated from.

### `path`

- Type: `string`
- Required, but **automatically inserted and updated by the `tsr generate` and `tsr watch` commands**
- The full path of the file that the route will be generated from.

### createLazyFileRoute returns

A new function that accepts a single argument of partial of the type [`RouteOptions`](../RouteOptionsType.md) that will be used to configure the file [`Route`](../RouteType.md) instance.

- Type:

```tsx
Pick<
  RouteOptions,
  'component' | 'pendingComponent' | 'errorComponent' | 'notFoundComponent'
>
```

- [`RouteOptions`](../RouteOptionsType.md)

> ⚠️ Note: For `tsr generate` and `tsr watch` to work properly, the file route instance must be exported from the file using the `Route` identifier.

### Examples

```tsx
import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/')({
  component: IndexComponent,
})

function IndexComponent() {
  const data = Route.useLoaderData()
  return <div>{data}</div>
}
```

# createLazyRoute function

The `createLazyRoute` function is used for creating a partial code-based route route instance that is lazily loaded when matched. This route instance can only be used to configure the [non-critical properties](../../../guide/code-splitting.md#how-does-tanstack-router-split-code) of the route, such as `component`, `pendingComponent`, `errorComponent`, and the `notFoundComponent`.

## createLazyRoute options

The `createLazyRoute` function accepts a single argument of type `string` that represents the `id` of the route.

### `id`

- Type: `string`
- Required
- The route id of the route.

### createLazyRoute returns

A new function that accepts a single argument of partial of the type [`RouteOptions`](../RouteOptionsType.md) that will be used to configure the file [`Route`](../RouteType.md) instance.

- Type:

```tsx
Pick<
  RouteOptions,
  'component' | 'pendingComponent' | 'errorComponent' | 'notFoundComponent'
>
```

- [`RouteOptions`](../RouteOptionsType.md)

> ⚠️ Note: This route instance must be manually lazily loaded against its critical route instance using the `lazy` method returned by the `createRoute` function.

### Examples

```tsx
// src/route-pages/index.tsx
import { createLazyRoute } from '@tanstack/react-router'

export const Route = createLazyRoute('/')({
  component: IndexComponent,
})

function IndexComponent() {
  const data = Route.useLoaderData()
  return <div>{data}</div>
}

// src/routeTree.tsx
import {
  createRootRouteWithContext,
  createRoute,
  Outlet,
} from '@tanstack/react-router'

interface MyRouterContext {
  foo: string
}

const rootRoute = createRootRouteWithContext<MyRouterContext>()({
  component: () => <Outlet />,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
}).lazy(() => import('./route-pages/index').then((d) => d.Route))

export const routeTree = rootRoute.addChildren([indexRoute])
```

# createRootRoute function

The `createRootRoute` function returns a new root route instance. A root route instance can then be used to create a route-tree.

## createRootRoute options

The options that will be used to configure the root route instance.

- Type:

```tsx
Omit<
  RouteOptions,
  | 'path'
  | 'id'
  | 'getParentRoute'
  | 'caseSensitive'
  | 'parseParams'
  | 'stringifyParams'
>
```

- [`RouteOptions`](../RouteOptionsType.md)
- Optional

## createRootRoute returns

A new [`Route`](../RouteType.md) instance.

## Examples

```tsx
import { createRootRoute, createRouter, Outlet } from '@tanstack/react-router'

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  // ... root route options
})

const routeTree = rootRoute.addChildren([
  // ... other routes
])

const router = createRouter({
  routeTree,
})
```

# createRootRouteWithContext function

The `createRootRouteWithContext` function is a helper function that can be used to create a root route instance that requires a context type to be fulfilled when the router is created.

## createRootRouteWithContext generics

The `createRootRouteWithContext` function accepts a single generic argument:

### `TRouterContext` generic

- Type: `TRouterContext`
- Optional, **but recommended**.
- The context type that will be required to be fulfilled when the router is created

## createRootRouteWithContext returns

- A factory function that can be used to create a new [`createRootRoute`](../createRootRouteFunction.md) instance.
- It accepts a single argument, the same as the [`createRootRoute`](../createRootRouteFunction.md) function.

## Examples

```tsx
import {
  createRootRouteWithContext,
  createRouter,
} from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

const rootRoute = createRootRouteWithContext<MyRouterContext>()({
  component: () => <Outlet />,
  // ... root route options
})

const routeTree = rootRoute.addChildren([
  // ... other routes
])

const queryClient = new QueryClient()

const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
})
```

# createRoute function

The `createRoute` function implements returns a [`Route`](../RouteType.md) instance. A route instance can then be passed to a root route's children to create a route tree, which is then passed to the router.

## createRoute options

- Type: [`RouteOptions`](../RouteOptionsType.md)
- Required
- The options that will be used to configure the route instance

## createRoute returns

A new [`Route`](../RouteType.md) instance.

## Examples

```tsx
import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './__root'

const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  loader: () => {
    return 'Hello World'
  },
  component: IndexComponent,
})

function IndexComponent() {
  const data = Route.useLoaderData()
  return <div>{data}</div>
}
```

# createRouteMask function

The `createRouteMask` function is a helper function that can be used to create a route mask configuration that can be passed to the `RouterOptions.routeMasks` option.

## createRouteMask options

- Type: [`RouteMask`](../RouteMaskType.md)
- Required
- The options that will be used to configure the route mask

## createRouteMask returns

- A object with the type signature of [`RouteMask`](../RouteMaskType.md) that can be passed to the `RouterOptions.routeMasks` option.

## Examples

```tsx
import { createRouteMask, createRouter } from '@tanstack/react-router'

const photoModalToPhotoMask = createRouteMask({
  routeTree,
  from: '/photos/$photoId/modal',
  to: '/photos/$photoId',
  params: true,
})

// Set up a Router instance
const router = createRouter({
  routeTree,
  routeMasks: [photoModalToPhotoMask],
})
```

# createRouter function

The `createRouter` function accepts a [`RouterOptions`](../RouterOptionsType.md) object and creates a new [`Router`](../RouterClass.md) instance.

## createRouter options

- Type: [`RouterOptions`](../RouterOptionsType.md)
- Required
- The options that will be used to configure the router instance.

## createRouter returns

- An instance of the [`Router`](../RouterType.md).

## Examples

```tsx
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
})

export default function App() {
  return <RouterProvider router={router} />
}
```

# DefaultGlobalNotFound component

The `DefaultGlobalNotFound` component is a component that renders "Not Found" on the root route when there is no other route that matches and a `notFoundComponent` is not provided.

## DefaultGlobalNotFound returns

```tsx
<p>Not Found</p>
```

# defer function

> [!CAUTION]
> You don't need to call `defer` manually anymore, Promises are handled automatically now.

The `defer` function wraps a promise with a deferred state object that can be used to inspect the promise's state. This deferred promise can then be passed to the [`useAwaited`](../useAwaitedHook.md) hook or the [`<Await>`](../awaitComponent.md) component for suspending until the promise is resolved or rejected.

The `defer` function accepts a single argument, the `promise` to wrap with a deferred state object.

## defer options

- Type: `Promise<T>`
- Required
- The promise to wrap with a deferred state object.

## defer returns

- A promise that can be passed to the [`useAwaited`](../useAwaitedHook.md) hook or the [`<Await>`](../awaitComponent.md) component.

## Examples

```tsx
import { defer } from '@tanstack/react-router'

const route = createRoute({
  loader: () => {
    const deferredPromise = defer(fetch('/api/data'))
    return { deferredPromise }
  },
  component: MyComponent,
})

function MyComponent() {
  const { deferredPromise } = Route.useLoaderData()

  const data = useAwaited({ promise: deferredPromise })

  // or

  return (
    <Await promise={deferredPromise}>
      {(data) => <div>{JSON.stringify(data)}</div>}
    </Await>
  )
}
```

# ErrorComponent component

The `ErrorComponent` component is a component that renders an error message and optionally the error's message.

## ErrorComponent props

The `ErrorComponent` component accepts the following props:

### `props.error` prop

- Type: `any`
- The error that was thrown by the component's children

### `props.reset` prop

- Type: `() => void`
- A function to programmatically reset the error state

## ErrorComponent returns

- Returns a formatted error message with the error's message if it exists.
- The error message can be toggled by clicking the "Show Error" button.
- By default, the error message will be shown in development.

# getRouteApi function

The `getRouteApi` function provides type-safe version of common hooks like `useParams`, `useSearch`, `useRouteContext`, `useNavigate`, `useLoaderData`, and `useLoaderDeps` that are pre-bound to a specific route ID and corresponding registered route types.

## getRouteApi options

The `getRouteApi` function accepts a single argument, a `routeId` string literal.

### `routeId` option

- Type: `string`
- Required
- The route ID to which the [`RouteApi`](../RouteApiClass.md) instance will be bound

## getRouteApi returns

- An instance of the [`RouteApi`](../RouteApiType.md) that is pre-bound to the route ID that the `getRouteApi` function was called with.

## Examples

```tsx
import { getRouteApi } from '@tanstack/react-router'

const routeApi = getRouteApi('/posts')

export function PostsPage() {
  const posts = routeApi.useLoaderData()
  // ...
}
```

# HistoryState interface

The `HistoryState` interface is an interface exported by the `history` package that describes the shape of the state object that can be used in conjunction with the `history` package and the `window.location` API.

You can extend this interface to add additional properties to the state object across your application.

```tsx
// src/main.tsx
declare module '@tanstack/react-router' {
  // ...

  interface HistoryState {
    additionalRequiredProperty: number
    additionalProperty?: string
  }
}
```

# isNotFound function

The `isNotFound` function can be used to determine if an object is a [`NotFoundError`](../NotFoundErrorType.md) object.

## isNotFound options

The `isNotFound` function accepts a single argument, an `input`.

### `input` option

- Type: `unknown`
- Required
- An object to check if it is a [`NotFoundError`](../NotFoundErrorType.md).

## isNotFound returns

- Type: `boolean`
- `true` if the object is a [`NotFoundError`](../NotFoundErrorType.md).
- `false` if the object is not a [`NotFoundError`](../NotFoundErrorType.md).

## Examples

```tsx
import { isNotFound } from '@tanstack/react-router'

function somewhere(obj: unknown) {
  if (isNotFound(obj)) {
    // ...
  }
}
```

# isRedirect function

The `isRedirect` function can be used to determine if an object is a redirect object.

## isRedirect options

The `isRedirect` function accepts a single argument, an `input`.

#### `input`

- Type: `unknown`
- Required
- An object to check if it is a redirect object

## isRedirect returns

- Type: `boolean`
- `true` if the object is a redirect object
- `false` if the object is not a redirect object

## Examples

```tsx
import { isRedirect } from '@tanstack/react-router'

function somewhere(obj: unknown) {
  if (isRedirect(obj)) {
    // ...
  }
}
```

# lazyRouteComponent function

> [!IMPORTANT]
> If you are using file-based routing, it's recommended to use the `createLazyFileRoute` function instead.

The `lazyRouteComponent` function can be used to create a one-off code-split route component that can be preloaded using a `component.preload()` method.

## lazyRouteComponent options

The `lazyRouteComponent` function accepts two arguments:

### `importer` option

- Type: `() => Promise<T>`
- Required
- A function that returns a promise that resolves to an object that contains the component to be loaded.

### `exportName` option

- Type: `string`
- Optional
- The name of the component to be loaded from the imported object. Defaults to `'default'`.

## lazyRouteComponent returns

- A `React.lazy` component that can be preloaded using a `component.preload()` method.

## Examples

```tsx
import { lazyRouteComponent } from '@tanstack/react-router'

const route = createRoute({
  path: '/posts/$postId',
  component: lazyRouteComponent(() => import('./Post')), // default export
})

// or

const route = createRoute({
  path: '/posts/$postId',
  component: lazyRouteComponent(
    () => import('./Post'),
    'PostByIdPageComponent', // named export
  ),
})
```

# Link component

The `Link` component is a component that can be used to create a link that can be used to navigate to a new location. This includes changes to the pathname, search params, hash, and location state.

## Link props

The `Link` component accepts the following props:

### `...props`

- Type: `LinkProps & React.RefAttributes<HTMLAnchorElement>`
- [`LinkProps`](../LinkPropsType.md)

## Link returns

An anchor element that can be used to navigate to a new location.

## Examples

```tsx
import { Link } from '@tanstack/react-router'

function Component() {
  return (
    <Link
      to="/somewhere/$somewhereId"
      params={{ somewhereId: 'baz' }}
      search={(prev) => ({ ...prev, foo: 'bar' })}
    >
      Click me
    </Link>
  )
}
```

# Link options

`linkOptions` is a function which type checks an object literal with the intention of being used for `Link`, `navigate` or `redirect`

## linkOptions props

The `linkOptions` accepts the following option:

### `...props`

- Type: `LinkProps & React.RefAttributes<HTMLAnchorElement>`
- [`LinkProps`](../LinkPropsType.md)

## `linkOptions` returns

An object literal with the exact type inferred from the input

## Examples

```tsx
const userLinkOptions = linkOptions({
  to: '/dashboard/users/user',
  search: {
    usersView: {
      sortBy: 'email',
      filterBy: 'filter',
    },
    userId: 0,
  },
})

function DashboardComponent() {
  return <Link {...userLinkOptions} />
}
```

# MatchRoute component

A component version of the `useMatchRoute` hook. It accepts the same options as the `useMatchRoute` with additional props to aid in conditional rendering.

## MatchRoute props

The `MatchRoute` component accepts the same options as the `useMatchRoute` hook with additional props to aid in conditional rendering.

### `...props` prop

- Type: [`UseMatchRouteOptions`](../UseMatchRouteOptionsType.md)

### `children` prop

- Optional
- `React.ReactNode`
  - The component that will be rendered if the route is matched.
- `((params: TParams | false) => React.ReactNode)`
  - A function that will be called with the matched route's params or `false` if no route was matched. This can be useful for components that need to always render, but render different props based on a route match or not.

## MatchRoute returns

Either the `children` prop or the return value of the `children` function.

## Examples

```tsx
import { MatchRoute } from '@tanstack/react-router'

function Component() {
  return (
    <div>
      <MatchRoute to="/posts/$postId" params={{ postId: '123' }} pending>
        {(match) => <Spinner show={!!match} wait="delay-50" />}
      </MatchRoute>
    </div>
  )
}
```

# Navigate component

The `Navigate` component is a component that can be used to navigate to a new location when rendered. This includes changes to the pathname, search params, hash, and location state. The underlying navigation will happen inside of a `useEffect` hook when successfully rendered.

## Navigate props

The `Navigate` component accepts the following props:

### `...options`

- Type: [`NavigateOptions`](../NavigateOptionsType.md)

## Navigate returns

- `null`

# notFound function

The `notFound` function returns a new `NotFoundError` object that can be either returned or thrown from places like a Route's `beforeLoad` or `loader` callbacks to trigger the `notFoundComponent`.

## notFound options

The `notFound` function accepts a single optional argument, the `options` to create the not-found error object.

- Type: [`Partial<NotFoundError>`](../NotFoundErrorType.md)
- Optional

## notFound returns

- If the `throw` property is `true` in the `options` object, the `NotFoundError` object will be thrown from within the function call.
- If the `throw` property is `false | undefined` in the `options` object, the `NotFoundError` object will be returned.

## Examples

```tsx
import { notFound, createFileRoute, rootRouteId } from '@tanstack/react-router'

const Route = new createFileRoute('/posts/$postId')({
  // throwing a not-found object
  loader: ({ context: { post } }) => {
    if (!post) {
      throw notFound()
    }
  },
  // or if you want to show a not-found on the whole page
  loader: ({ context: { team } }) => {
    if (!team) {
      throw notFound({ routeId: rootRouteId })
    }
  },
  // ... other route options
})
```

# Outlet component

The `Outlet` component is a component that can be used to render the next child route of a parent route.

## Outlet props

The `Outlet` component does not accept any props.

## Outlet returns

- If matched, the child route match's `component`/`errorComponent`/`pendingComponent`/`notFoundComponent`.
- If not matched, `null`.

# redirect function

The `redirect` function returns a new `Redirect` object that can be either returned or thrown from places like a Route's `beforeLoad` or `loader` callbacks to trigger _redirect_ to a new location.

## redirect options

The `redirect` function accepts a single argument, the `options` to determine the redirect behavior.

- Type: [`Redirect`](../RedirectType.md)
- Required

## redirect returns

- If the `throw` property is `true` in the `options` object, the `Redirect` object will be thrown from within the function call.
- If the `throw` property is `false | undefined` in the `options` object, the `Redirect` object will be returned.

## Examples

```tsx
import { redirect } from '@tanstack/react-router'

const route = createRoute({
  // throwing a redirect object
  loader: () => {
    if (!user) {
      throw redirect({
        to: '/login',
      })
    }
  },
  // or forcing `redirect` to throw itself
  loader: () => {
    if (!user) {
      redirect({
        to: '/login',
        throw: true,
      })
    }
  },
  // ... other route options
})
```

# Search middleware to retain search params

`retainSearchParams` is a search middleware that allows to keep search params.

## retainSearchParams props

The `retainSearchParams` either accepts `true` or a list of keys of those search params that shall be retained.
If `true` is passed in, all search params will be retained.

## Examples

```tsx
import { z } from 'zod'
import { createRootRoute, retainSearchParams } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'

const searchSchema = z.object({
  rootValue: z.string().optional(),
})

export const Route = createRootRoute({
  validateSearch: zodValidator(searchSchema),
  search: {
    middlewares: [retainSearchParams(['rootValue'])],
  },
})
```

```tsx
import { z } from 'zod'
import { createFileRoute, retainSearchParams } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'

const searchSchema = z.object({
  one: z.string().optional(),
  two: z.string().optional(),
})

export const Route = createFileRoute('/hello')({
  validateSearch: zodValidator(searchSchema),
  search: {
    middlewares: [retainSearchParams(true)],
  },
})
```

# rootRouteWithContext function

> [!CAUTION]
> This function is deprecated and will be removed in the next major version of TanStack Router.
> Please use the [`createRootRouteWithContext`](../createRootRouteWithContextFunction.md) function instead.

The `rootRouteWithContext` function is a helper function that can be used to create a root route instance that requires a context type to be fulfilled when the router is created.

## rootRouteWithContext generics

The `rootRouteWithContext` function accepts a single generic argument:

### `TRouterContext` generic

- Type: `TRouterContext`
- Optional, **but recommended**.
- The context type that will be required to be fulfilled when the router is created

## rootRouteWithContext returns

- A factory function that can be used to create a new [`createRootRoute`](../createRootRouteFunction.md) instance.
- It accepts a single argument, the same as the [`createRootRoute`](../createRootRouteFunction.md) function.

## Examples

```tsx
import { rootRouteWithContext, createRouter } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

const rootRoute = rootRouteWithContext<MyRouterContext>()({
  component: () => <Outlet />,
  // ... root route options
})

const routeTree = rootRoute.addChildren([
  // ... other routes
])

const queryClient = new QueryClient()

const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
})
```

# Search middleware to strip search params

`stripSearchParams` is a search middleware that allows to remove search params.

## stripSearchParams props

`stripSearchParams` accepts one of the following inputs:

- `true`: if the search schema has no required params, `true` can be used to strip all search params
- a list of keys of those search params that shall be removed; only keys of optional search params are allowed.
- an object that conforms to the partial input search schema. The search params are compared against the values of this object; if the value is deeply equal, it will be removed. This is especially useful to strip out default search params.

## Examples

```tsx
import { z } from 'zod'
import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'

const defaultValues = {
  one: 'abc',
  two: 'xyz',
}

const searchSchema = z.object({
  one: z.string().default(defaultValues.one),
  two: z.string().default(defaultValues.two),
})

export const Route = createFileRoute('/hello')({
  validateSearch: zodValidator(searchSchema),
  search: {
    // strip default values
    middlewares: [stripSearchParams(defaultValues)],
  },
})
```

```tsx
import { z } from 'zod'
import { createRootRoute, stripSearchParams } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'

const searchSchema = z.object({
  hello: z.string().default('world'),
  requiredParam: z.string(),
})

export const Route = createRootRoute({
  validateSearch: zodValidator(searchSchema),
  search: {
    // always remove `hello`
    middlewares: [stripSearchParams(['hello'])],
  },
})
```

```tsx
import { z } from 'zod'
import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'

const searchSchema = z.object({
  one: z.string().default('abc'),
  two: z.string().default('xyz'),
})

export const Route = createFileRoute('/hello')({
  validateSearch: zodValidator(searchSchema),
  search: {
    // remove all search params
    middlewares: [stripSearchParams(true)],
  },
})
```

# useAwaited hook

The `useAwaited` method is a hook that suspends until the provided promise is resolved or rejected.

## useAwaited options

The `useAwaited` hook accepts a single argument, an `options` object.

### `options.promise` option

- Type: `Promise<T>`
- Required
- The deferred promise to await.

## useAwaited returns

- Throws an error if the promise is rejected.
- Suspends (throws a promise) if the promise is pending.
- Returns the resolved value of a deferred promise if the promise is resolved.

## Examples

```tsx
import { useAwaited } from '@tanstack/react-router'

function Component() {
  const { deferredPromise } = route.useLoaderData()

  const data = useAwaited({ promise: myDeferredPromise })
  // ...
}
```

# useBlocker hook

The `useBlocker` method is a hook that [blocks navigation](../../../guide/navigation-blocking.md) when a condition is met.

> ⚠️ The following new `useBlocker` API is currently _experimental_.

## useBlocker options

The `useBlocker` hook accepts a single _required_ argument, an option object:

### `options.shouldBlockFn` option

- Required
- Type: `ShouldBlockFn`
- This function should return a `boolean` or a `Promise<boolean>` that tells the blocker if it should block the current navigation
- The function has the argument of type `ShouldBlockFnArgs` passed to it, which tells you information about the current and next route and the action performed
- Think of this function as telling the router if it should block the navigation, so returning `true` mean that it should block the navigation and `false` meaning that it should be allowed

```ts
interface ShouldBlockFnLocation<...> {
  routeId: TRouteId
  fullPath: TFullPath
  pathname: string
  params: TAllParams
  search: TFullSearchSchema
}

type ShouldBlockFnArgs = {
  current: ShouldBlockFnLocation
  next: ShouldBlockFnLocation
  action: HistoryAction
}
```

### `options.disabled` option

- Optional - defaults to `false`
- Type: `boolean`
- Specifies if the blocker should be entirely disabled or not

### `options.enableBeforeUnload` option

- Optional - defaults to `true`
- Type: `boolean | (() => boolean)`
- Tell the blocker to sometimes or always block the browser `beforeUnload` event or not

### `options.withResolver` option

- Optional - defaults to `false`
- Type: `boolean`
- Specify if the resolver returned by the hook should be used or whether your `shouldBlockFn` function itself resolves the blocking

### `options.blockerFn` option (⚠️ deprecated)

- Optional
- Type: `BlockerFn`
- The function that returns a `boolean` or `Promise<boolean>` indicating whether to allow navigation.

### `options.condition` option (⚠️ deprecated)

- Optional - defaults to `true`
- Type: `boolean`
- A navigation attempt is blocked when this condition is `true`.

## useBlocker returns

An object with the controls to allow manual blocking and unblocking of navigation.

- `status` - A string literal that can be either `'blocked'` or `'idle'`
- `next` - When status is `blocked`, a type narrrowable object that contains information about the next location
- `current` - When status is `blocked`, a type narrrowable object that contains information about the current location
- `action` - When status is `blocked`, a `HistoryAction` string that shows the action that triggered the navigation
- `proceed` - When status is `blocked`, a function that allows navigation to continue
- `reset` - When status is `blocked`, a function that cancels navigation (`status` will be reset to `'idle'`)

or

`void` when `withResolver` is `false`

## Examples

Two common use cases for the `useBlocker` hook are:

### Basic usage

```tsx
import { useBlocker } from '@tanstack/react-router'

function MyComponent() {
  const [formIsDirty, setFormIsDirty] = useState(false)

  useBlocker({
    shouldBlockFn: () => formIsDirty,
  })

  // ...
}
```

### Custom UI

```tsx
import { useBlocker } from '@tanstack/react-router'

function MyComponent() {
  const [formIsDirty, setFormIsDirty] = useState(false)

  const { proceed, reset, status, next } = useBlocker({
    shouldBlockFn: () => formIsDirty,
    withResolver: true,
  })

  // ...

  return (
    <>
      {/* ... */}
      {status === 'blocked' && (
        <div>
          <p>You are navigating to {next.pathname}</p>
          <p>Are you sure you want to leave?</p>
          <button onClick={proceed}>Yes</button>
          <button onClick={reset}>No</button>
        </div>
      )}
    </>
}
```

### Conditional blocking

```tsx
import { useBlocker } from '@tanstack/react-router'

function MyComponent() {
  const { proceed, reset, status } = useBlocker({
    shouldBlockFn: ({ next }) => {
      return !next.pathname.includes('step/')
    },
    withResolver: true,
  })

  // ...

  return (
    <>
      {/* ... */}
      {status === 'blocked' && (
        <div>
          <p>Are you sure you want to leave?</p>
          <button onClick={proceed}>Yes</button>
          <button onClick={reset}>No</button>
        </div>
      )}
    </>
  )
}
```

### Without resolver

```tsx
import { useBlocker } from '@tanstack/react-router'

function MyComponent() {
  const [formIsDirty, setFormIsDirty] = useState(false)

  useBlocker({
    shouldBlockFn: ({ next }) => {
      if (next.pathname.includes('step/')) {
        return false
      }

      const shouldLeave = confirm('Are you sure you want to leave?')
      return !shouldLeave
    },
  })

  // ...
}
```

### Type narrowing

```tsx
import { useBlocker } from '@tanstack/react-router'

function MyComponent() {
  const [formIsDirty, setFormIsDirty] = useState(false)

  // block going from editor-1 to /foo/123?hello=world
  const { proceed, reset, status } = useBlocker({
    shouldBlockFn: ({ current, next }) => {
      if (
        current.routeId === '/editor-1' &&
        next.fullPath === '/foo/$id' &&
        next.params.id === '123' &&
        next.search.hello === 'world'
      ) {
        return true
      }
      return false
    },
    enableBeforeUnload: false,
    withResolver: true,
  })

  // ...
}
```

# useCanGoBack hook

The `useCanGoBack` hook returns a boolean representing if the router history can safely go back without exiting the application.

> ⚠️ The following new `useCanGoBack` API is currently _experimental_.

## useCanGoBack returns

- If the router history is not at index `0`, `true`.
- If the router history is at index `0`, `false`.

## Limitations

The router history index is reset after a navigation with [`reloadDocument`](../NavigateOptionsType.md#reloaddocument) set as `true`. This causes the router history to consider the new location as the initial one and will cause `useCanGoBack` to return `false`.

## Examples

### Showing a back button

```tsx
import { useRouter, useCanGoBack } from '@tanstack/react-router'

function Component() {
  const router = useRouter()
  const canGoBack = useCanGoBack()

  return (
    <div>
      {canGoBack ? (
        <button onClick={() => router.history.back()}>Go back</button>
      ) : null}

      {/* ... */}
    </div>
  )
}
```

# useChildMatches hook

The `useChildMatches` hook returns all of the child [`RouteMatch`](../RouteMatchType.md) objects from the closest match down to the leaf-most match. **It does not include the current match, which can be obtained using the `useMatch` hook.**

> [!IMPORTANT]
> If the router has pending matches and they are showing their pending component fallbacks, `router.state.pendingMatches` will used instead of `router.state.matches`.

## useChildMatches options

The `useChildMatches` hook accepts a single _optional_ argument, an `options` object.

### `opts.select` option

- Optional
- `(matches: RouteMatch[]) => TSelected`
- If supplied, this function will be called with the route matches and the return value will be returned from `useChildMatches`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.

### `opts.structuralSharing` option

- Type: `boolean`
- Optional
- Configures whether structural sharing is enabled for the value returned by `select`.
- See the [Render Optimizations guide](../../../guide/render-optimizations.md) for more information.

## useChildMatches returns

- If a `select` function is provided, the return value of the `select` function.
- If no `select` function is provided, an array of [`RouteMatch`](../RouteMatchType.md) objects.

## Examples

```tsx
import { useChildMatches } from '@tanstack/react-router'

function Component() {
  const childMatches = useChildMatches()
  // ...
}
```

# useLinkProps hook

The `useLinkProps` hook that takes an object as its argument and returns a `React.AnchorHTMLAttributes<HTMLAnchorElement>` props object. These props can then be safely applied to an anchor element to create a link that can be used to navigate to the new location. This includes changes to the pathname, search params, hash, and location state.

## useLinkProps options

```tsx
type UseLinkPropsOptions = ActiveLinkOptions &
  React.AnchorHTMLAttributes<HTMLAnchorElement>
```

- [`ActiveLinkOptions`](../ActiveLinkOptionsType.md)
- The `useLinkProps` options are used to build a [`LinkProps`](../LinkPropsType.md) object.
- It also extends the `React.AnchorHTMLAttributes<HTMLAnchorElement>` type, so that any additional props that are passed to the `useLinkProps` hook will be merged with the [`LinkProps`](../LinkPropsType.md) object.

## useLinkProps returns

- A `React.AnchorHTMLAttributes<HTMLAnchorElement>` object that can be applied to an anchor element to create a link that can be used to navigate to the new location

# useLoaderData hook

The `useLoaderData` hook returns the loader data from the closest [`RouteMatch`](../RouteMatchType.md) in the component tree.

## useLoaderData options

The `useLoaderData` hook accepts an `options` object.

### `opts.from` option

- Type: `string`
- The route id of the closest parent match
- Optional, but recommended for full type safety.
- If `opts.strict` is `true`, TypeScript will warn for this option if it is not provided.
- If `opts.strict` is `false`, TypeScript will provided loosened types for the returned loader data.

### `opts.strict` option

- Type: `boolean`
- Optional - `default: true`
- If `false`, the `opts.from` option will be ignored and types will be loosened to to reflect the shared types of all possible loader data.

### `opts.select` option

- Optional
- `(loaderData: TLoaderData) => TSelected`
- If supplied, this function will be called with the loader data and the return value will be returned from `useLoaderData`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.

### `opts.structuralSharing` option

- Type: `boolean`
- Optional
- Configures whether structural sharing is enabled for the value returned by `select`.
- See the [Render Optimizations guide](../../../guide/render-optimizations.md) for more information.

## useLoaderData returns

- If a `select` function is provided, the return value of the `select` function.
- If no `select` function is provided, the loader data or a loosened version of the loader data if `opts.strict` is `false`.

## Examples

```tsx
import { useLoaderData } from '@tanstack/react-router'

function Component() {
  const loaderData = useLoaderData({ from: '/posts/$postId' })
  //     ^? { postId: string, body: string, ... }
  // ...
}
```

# useLoaderDeps hook

The `useLoaderDeps` hook is a hook that returns an object with the dependencies that are used to trigger the `loader` for a given route.

## useLoaderDepsHook options

The `useLoaderDepsHook` hook accepts an `options` object.

### `opts.from` option

- Type: `string`
- Required
- The RouteID or path to get the loader dependencies from.

### `opts.select` option

- Type: `(deps: TLoaderDeps) => TSelected`
- Optional
- If supplied, this function will be called with the loader dependencies object and the return value will be returned from `useLoaderDeps`.

### `opts.structuralSharing` option

- Type: `boolean`
- Optional
- Configures whether structural sharing is enabled for the value returned by `select`.
- See the [Render Optimizations guide](../../../guide/render-optimizations.md) for more information.

## useLoaderDeps returns

- An object of the loader dependencies or `TSelected` if a `select` function is provided.

## Examples

```tsx
import { useLoaderDeps } from '@tanstack/react-router'

const routeApi = getRouteApi('/posts/$postId')

function Component() {
  const deps = useLoaderDeps({ from: '/posts/$postId' })

  // OR

  const routeDeps = routeApi.useLoaderDeps()

  // OR

  const postId = useLoaderDeps({
    from: '/posts',
    select: (deps) => deps.view,
  })

  // ...
}
```

# useLocation hook

The `useLocation` method is a hook that returns the current [`location`](../ParsedLocationType.md) object. This hook is useful for when you want to perform some side effect whenever the current location changes.

## useLocation options

The `useLocation` hook accepts an optional `options` object.

### `opts.select` option

- Type: `(state: ParsedLocationType) => TSelected`
- Optional
- If supplied, this function will be called with the [`location`](../ParsedLocationType.md) object and the return value will be returned from `useLocation`.

## useLocation returns

- The current [`location`](../ParsedLocationType.md) object or `TSelected` if a `select` function is provided.

## Examples

```tsx
import { useLocation } from '@tanstack/react-router'

function Component() {
  const location = useLocation()
  //    ^ ParsedLocation

  // OR

  const pathname = useLocation({
    select: (location) => location.pathname,
  })
  //    ^ string

  // ...
}
```

# useMatch hook

The `useMatch` hook returns a [`RouteMatch`](../RouteMatchType.md) in the component tree. The raw route match contains all of the information about a route match in the router and also powers many other hooks under the hood like `useParams`, `useLoaderData`, `useRouteContext`, and `useSearch`.

## useMatch options

The `useMatch` hook accepts a single argument, an `options` object.

### `opts.from` option

- Type: `string`
- The route id of a match
- Optional, but recommended for full type safety.
- If `opts.strict` is `true`, `from` is required and TypeScript will warn for this option if it is not provided.
- If `opts.strict` is `false`, `from` must not be set and TypeScript will provided loosened types for the returned [`RouteMatch`](../RouteMatchType.md).

### `opts.strict` option

- Type: `boolean`
- Optional
- `default: true`
- If `false`, the `opts.from` must not be set and types will be loosened to `Partial<RouteMatch>` to reflect the shared types of all matches.

### `opts.select` option

- Optional
- `(match: RouteMatch) => TSelected`
- If supplied, this function will be called with the route match and the return value will be returned from `useMatch`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.

### `opts.structuralSharing` option

- Type: `boolean`
- Optional
- Configures whether structural sharing is enabled for the value returned by `select`.
- See the [Render Optimizations guide](../../../guide/render-optimizations.md) for more information.

### `opts.shouldThrow` option

- Type: `boolean`
- Optional
- `default: true`
- If `false`,`useMatch` will not throw an invariant exception in case a match was not found in the currently rendered matches; in this case, it will return `undefined`.

## useMatch returns

- If a `select` function is provided, the return value of the `select` function.
- If no `select` function is provided, the [`RouteMatch`](../RouteMatchType.md) object or a loosened version of the `RouteMatch` object if `opts.strict` is `false`.

## Examples

### Accessing a route match

```tsx
import { useMatch } from '@tanstack/react-router'

function Component() {
  const match = useMatch({ from: '/posts/$postId' })
  //     ^? strict match for RouteMatch
  // ...
}
```

### Accessing the root route's match

```tsx
import {
  useMatch,
  rootRouteId, // <<<< use this token!
} from '@tanstack/react-router'

function Component() {
  const match = useMatch({ from: rootRouteId })
  //     ^? strict match for RouteMatch
  // ...
}
```

### Checking if a specific route is currently rendered

```tsx
import { useMatch } from '@tanstack/react-router'

function Component() {
  const match = useMatch({ from: '/posts', shouldThrow: false })
  //     ^? RouteMatch | undefined
  if (match !== undefined) {
    // ...
  }
}
```

# useMatchRoute hook

The `useMatchRoute` hook is a hook that returns a `matchRoute` function that can be used to match a route against either the current or pending location.

## useMatchRoute returns

- A `matchRoute` function that can be used to match a route against either the current or pending location.

## matchRoute function

The `matchRoute` function is a function that can be used to match a route against either the current or pending location.

### matchRoute function options

The `matchRoute` function accepts a single argument, an `options` object.

- Type: [`UseMatchRouteOptions`](../UseMatchRouteOptionsType.md)

### matchRoute function returns

- The matched route's params or `false` if no route was matched

## Examples

```tsx
import { useMatchRoute } from '@tanstack/react-router'

// Current location: /posts/123
function Component() {
  const matchRoute = useMatchRoute()
  const params = matchRoute({ to: '/posts/$postId' })
  //    ^ { postId: '123' }
}

// Current location: /posts/123
function Component() {
  const matchRoute = useMatchRoute()
  const params = matchRoute({ to: '/posts' })
  //    ^ false
}

// Current location: /posts/123
function Component() {
  const matchRoute = useMatchRoute()
  const params = matchRoute({ to: '/posts', fuzzy: true })
  //    ^ {}
}

// Current location: /posts
// Pending location: /posts/123
function Component() {
  const matchRoute = useMatchRoute()
  const params = matchRoute({ to: '/posts/$postId', pending: true })
  //    ^ { postId: '123' }
}

// Current location: /posts/123/foo/456
function Component() {
  const matchRoute = useMatchRoute()
  const params = matchRoute({ to: '/posts/$postId/foo/$fooId' })
  //    ^ { postId: '123', fooId: '456' }
}

// Current location: /posts/123/foo/456
function Component() {
  const matchRoute = useMatchRoute()
  const params = matchRoute({
    to: '/posts/$postId/foo/$fooId',
    params: { postId: '123' },
  })
  //    ^ { postId: '123', fooId: '456' }
}

// Current location: /posts/123/foo/456
function Component() {
  const matchRoute = useMatchRoute()
  const params = matchRoute({
    to: '/posts/$postId/foo/$fooId',
    params: { postId: '789' },
  })
  //    ^ false
}

// Current location: /posts/123/foo/456
function Component() {
  const matchRoute = useMatchRoute()
  const params = matchRoute({
    to: '/posts/$postId/foo/$fooId',
    params: { fooId: '456' },
  })
  //    ^ { postId: '123', fooId: '456' }
}

// Current location: /posts/123/foo/456
function Component() {
  const matchRoute = useMatchRoute()
  const params = matchRoute({
    to: '/posts/$postId/foo/$fooId',
    params: { postId: '123', fooId: '456' },
  })
  //    ^ { postId: '123', fooId: '456' }
}

// Current location: /posts/123/foo/456
function Component() {
  const matchRoute = useMatchRoute()
  const params = matchRoute({
    to: '/posts/$postId/foo/$fooId',
    params: { postId: '789', fooId: '456' },
  })
  //    ^ false
}
```

# useMatches hook

The `useMatches` hook returns all of the [`RouteMatch`](../RouteMatchType.md) objects from the router **regardless of its callers position in the React component tree**.

> [!TIP]
> If you only want the parent or child matches, then you can use the [`useParentMatches`](../useParentMatchesHook.md) or the [`useChildMatches`](../useChildMatchesHook.md) based on the selection you need.

## useMatches options

The `useMatches` hook accepts a single _optional_ argument, an `options` object.

### `opts.select` option

- Optional
- `(matches: RouteMatch[]) => TSelected`
- If supplied, this function will be called with the route matches and the return value will be returned from `useMatches`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.

### `opts.structuralSharing` option

- Type: `boolean`
- Optional
- Configures whether structural sharing is enabled for the value returned by `select`.
- See the [Render Optimizations guide](../../../guide/render-optimizations.md) for more information.

## useMatches returns

- If a `select` function is provided, the return value of the `select` function.
- If no `select` function is provided, an array of [`RouteMatch`](../RouteMatchType.md) objects.

## Examples

```tsx
import { useMatches } from '@tanstack/react-router'

function Component() {
  const matches = useMatches()
  //     ^? [RouteMatch, RouteMatch, ...]
  // ...
}
```

# useNavigate hook

The `useNavigate` hook is a hook that returns a `navigate` function that can be used to navigate to a new location. This includes changes to the pathname, search params, hash, and location state.

## useNavigate options

The `useNavigate` hook accepts a single argument, an `options` object.

### `opts.from` option

- Type: `string`
- Optional
- Description: The location to navigate from. This is useful when you want to navigate to a new location from a specific location, rather than the current location.

## useNavigate returns

- A `navigate` function that can be used to navigate to a new location.

## navigate function

The `navigate` function is a function that can be used to navigate to a new location.

### navigate function options

The `navigate` function accepts a single argument, an `options` object.

- Type: [`NavigateOptions`](../NavigateOptionsType.md)

### navigate function returns

- A `Promise` that resolves when the navigation is complete

## Examples

```tsx
import { useNavigate } from '@tanstack/react-router'

function PostsPage() {
  const navigate = useNavigate({ from: '/posts' })
  const handleClick = () => navigate({ search: { page: 2 } })
  // ...
}

function Component() {
  const navigate = useNavigate()
  return (
    <div>
      <button
        onClick={() =>
          navigate({
            to: '/posts',
          })
        }
      >
        Posts
      </button>
      <button
        onClick={() =>
          navigate({
            to: '/posts',
            search: { page: 2 },
          })
        }
      >
        Posts (Page 2)
      </button>
      <button
        onClick={() =>
          navigate({
            to: '/posts',
            hash: 'my-hash',
          })
        }
      >
        Posts (Hash)
      </button>
      <button
        onClick={() =>
          navigate({
            to: '/posts',
            state: { from: 'home' },
          })
        }
      >
        Posts (State)
      </button>
    </div>
  )
}
```

# useParams hook

The `useParams` method returns all of the path parameters that were parsed for the closest match and all of its parent matches.

## useParams options

The `useParams` hook accepts an optional `options` object.

### `opts.strict` option

- Type: `boolean`
- Optional - `default: true`
- If `false`, the `opts.from` option will be ignored and types will be loosened to `Partial<AllParams>` to reflect the shared types of all params.

### `opts.shouldThrow` option

- Type: `boolean`
- Optional
- `default: true`
- If `false`,`useParams` will not throw an invariant exception in case a match was not found in the currently rendered matches; in this case, it will return `undefined`.

### `opts.select` option

- Optional
- `(params: AllParams) => TSelected`
- If supplied, this function will be called with the params object and the return value will be returned from `useParams`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.

### `opts.structuralSharing` option

- Type: `boolean`
- Optional
- Configures whether structural sharing is enabled for the value returned by `select`.
- See the [Render Optimizations guide](../../../guide/render-optimizations.md) for more information.

## useParams returns

- An object of of the match's and parent match path params or `TSelected` if a `select` function is provided.

## Examples

```tsx
import { useParams } from '@tanstack/react-router'

const routeApi = getRouteApi('/posts/$postId')

function Component() {
  const params = useParams({ from: '/posts/$postId' })

  // OR

  const routeParams = routeApi.useParams()

  // OR

  const postId = useParams({
    from: '/posts/$postId',
    select: (params) => params.postId,
  })

  // OR

  const looseParams = useParams({ strict: false })

  // ...
}
```

# useParentMatches hook

The `useParentMatches` hook returns all of the parent [`RouteMatch`](../RouteMatchType.md) objects from the root down to the immediate parent of the current match in context. **It does not include the current match, which can be obtained using the `useMatch` hook.**

> [!IMPORTANT]
> If the router has pending matches and they are showing their pending component fallbacks, `router.state.pendingMatches` will used instead of `router.state.matches`.

## useParentMatches options

The `useParentMatches` hook accepts an optional `options` object.

### `opts.select` option

- Optional
- `(matches: RouteMatch[]) => TSelected`
- If supplied, this function will be called with the route matches and the return value will be returned from `useParentMatches`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.

### `opts.structuralSharing` option

- Type: `boolean`
- Optional
- Configures whether structural sharing is enabled for the value returned by `select`.
- See the [Render Optimizations guide](../../../guide/render-optimizations.md) for more information.

## useParentMatches returns

- If a `select` function is provided, the return value of the `select` function.
- If no `select` function is provided, an array of [`RouteMatch`](../RouteMatchType.md) objects.

## Examples

```tsx
import { useParentMatches } from '@tanstack/react-router'

function Component() {
  const parentMatches = useParentMatches()
  //    ^ [RouteMatch, RouteMatch, ...]
}
```

# useRouteContext hook

The `useRouteContext` method is a hook that returns the current context for the current route. This hook is useful for accessing the current route context in a component.

## useRouteContext options

The `useRouteContext` hook accepts an `options` object.

### `opts.from` option

- Type: `string`
- Required
- The RouteID to match the route context from.

### `opts.select` option

- Type: `(context: RouteContext) => TSelected`
- Optional
- If supplied, this function will be called with the route context object and the return value will be returned from `useRouteContext`.

## useRouteContext returns

- The current context for the current route or `TSelected` if a `select` function is provided.

## Examples

```tsx
import { useRouteContext } from '@tanstack/react-router'

function Component() {
  const context = useRouteContext({ from: '/posts/$postId' })
  //    ^ RouteContext

  // OR

  const selected = useRouteContext({
    from: '/posts/$postId',
    select: (context) => context.postId,
  })
  //    ^ string

  // ...
}
```

# useRouter hook

The `useRouter` method is a hook that returns the current instance of [`Router`](../RouterType.md) from context. This hook is useful for accessing the router instance in a component.

## useRouter returns

- The current [`Router`](../RouterType.md) instance.

> ⚠️⚠️⚠️ **`router.state` is always up to date, but NOT REACTIVE. If you use `router.state` in a component, the component will not re-render when the router state changes. To get a reactive version of the router state, use the [`useRouterState`](../useRouterStateHook.md) hook.**

## Examples

```tsx
import { useRouter } from '@tanstack/react-router'

function Component() {
  const router = useRouter()
  //    ^ Router

  // ...
}
```

# useRouterState hook

The `useRouterState` method is a hook that returns the current internal state of the router. This hook is useful for accessing the current state of the router in a component.

> [!TIP]
> If you want to access the current location or the current matches, you should try out the [`useLocation`](../useLocationHook.md) and [`useMatches`](../useMatchesHook.md) hooks first. These hooks are designed to be more ergonomic and easier to use than accessing the router state directly.

## useRouterState options

The `useRouterState` hook accepts an optional `options` object.

### `opts.select` option

- Type: `(state: RouterState) => TSelected`
- Optional
- If supplied, this function will be called with the [`RouterState`](../RouterStateType.md) object and the return value will be returned from `useRouterState`.

### `opts.structuralSharing` option

- Type: `boolean`
- Optional
- Configures whether structural sharing is enabled for the value returned by `select`.
- See the [Render Optimizations guide](../../../guide/render-optimizations.md) for more information.

## useRouterState returns

- The current [`RouterState`](../RouterStateType.md) object or `TSelected` if a `select` function is provided.

## Examples

```tsx
import { useRouterState } from '@tanstack/react-router'

function Component() {
  const state = useRouterState()
  //    ^ RouterState

  // OR

  const selected = useRouterState({
    select: (state) => state.location,
  })
  //    ^ ParsedLocation

  // ...
}
```

# useSearch hook

The `useSearch` method is a hook that returns the current search query parameters as an object for the current location. This hook is useful for accessing the current search string and query parameters in a component.

## useSearch options

The `useSearch` hook accepts an `options` object.

### `opts.from` option

- Type: `string`
- Required
- The RouteID to match the search query parameters from.

### `opts.shouldThrow` option

- Type: `boolean`
- Optional
- `default: true`
- If `false`,`useSearch` will not throw an invariant exception in case a match was not found in the currently rendered matches; in this case, it will return `undefined`.

### `opts.select` option

- Type: `(search: SelectedSearchSchema) => TSelected`
- Optional
- If supplied, this function will be called with the search object and the return value will be returned from `useSearch`.

### `opts.structuralSharing` option

- Type: `boolean`
- Optional
- Configures whether structural sharing is enabled for the value returned by `select`.
- See the [Render Optimizations guide](../../../guide/render-optimizations.md) for more information.

### `opts.strict` option

- Type: `boolean`
- Optional - `default: true`
- If `false`, the `opts.from` option will be ignored and types will be loosened to `Partial<FullSearchSchema>` to reflect the shared types of all search query parameters.

## useSearch returns

- If `opts.from` is provided, an object of the search query parameters for the current location or `TSelected` if a `select` function is provided.
- If `opts.strict` is `false`, an object of the search query parameters for the current location or `TSelected` if a `select` function is provided.

## Examples

```tsx
import { useSearch } from '@tanstack/react-router'

function Component() {
  const search = useSearch({ from: '/posts/$postId' })
  //    ^ FullSearchSchema

  // OR

  const selected = useSearch({
    from: '/posts/$postId',
    select: (search) => search.postView,
  })
  //    ^ string

  // OR

  const looseSearch = useSearch({ strict: false })
  //    ^ Partial<FullSearchSchema>

  // ...
}
```

