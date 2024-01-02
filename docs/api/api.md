---
id: api
title: API Reference
---

# `useParams`

The `useParams` method returns all of the path parameters that were parsed for the closest match and all of its parent matches.

### Options

#### `opts.strict`

- Type: `boolean`
- Optional - `default: true`
- If `false`, the `opts.from` option will be ignored and types will be loosened to `Partial<AllParams>` to reflect the shared types of all params.

#### `opts.select`

- Optional
- `(params: AllParams) => TSelected`
- If supplied, this function will be called with the params object and the return value will be returned from `useParams`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.

### Returns

- An object of of the match's and parent match path params or `TSelected` if a `select` function is provided.

### Examples

```tsx
import { useParams } from '@tanstack/react-router'

function Component() {
  const params = myRoute.useParams({ from: '/posts/$postId' })

  // OR

  const postId = myRoute.useParams({
    from: '/posts/$postId',
    select: (params) => params.postId,
  })

  // OR

  const looseParams = myRoute.useParams({ strict: false })
}
```

# `AwaitOptions` type

```tsx
type AwaitOptions<T> = {
  promise: DeferredPromise<T>
}
```

# `DeferredPromise` type

```tsx
type DeferredPromise<T> = Promise<T> & {
  __deferredState: DeferredPromiseState<T>
}
```

# `DeferredPromiseState` type

```tsx
type DeferredPromiseState<T> = { uid: string } & (
  | {
      status: 'pending'
      data?: T
      error?: unknown
    }
  | {
      status: 'success'
      data: T
    }
  | {
      status: 'error'
      data?: T
      error: unknown
    }
)
```

# `useAwaited` hook

The `useAwaited` method is a hook that suspends until the provided promise is resolved or rejected.

### Options

#### `opts.promise`

- Type: `DeferredPromise<T>`
- Required
- The deferred promise to await

### Returns

- Throws an error if the promise is rejected
- Suspends (throws a promise) if the promise is pending
- Returns the resolved value of a deferred promise if the promise is resolved

### Examples

```tsx
import { useAwaited } from '@tanstack/react-router'

function Component() {
  const { deferredPromise } = route.useLoaderData()
  const data = useAwaited({ promise: myDeferredPromise })
}
```

# `Await` component

The `Await` component is a component that suspends until the provided promise is resolved or rejected.

### Props

#### `props.promise`

- Type: `DeferredPromise<T>`
- Required
- The deferred promise to await

#### `props.children`

- Type: `(result: T) => JSX.Element`
- Required
- A function that will be called with the resolved value of the promise

### Returns

- Throws an error if the promise is rejected
- Suspends (throws a promise) if the promise is pending
- Returns the resolved value of a deferred promise if the promise is resolved

### Examples

```tsx
import { Await } from '@tanstack/react-router'

function Component() {
  const { deferredPromise } = route.useLoaderData()
  return (
    <Await promise={myDeferredPromise}>{(data) => <div>{data}</div>}</Await>
  )
}
```

# `CatchBoundary` component

The `CatchBoundary` component is a component that catches errors thrown by its children, renders an error component and optionally calls the `onCatch` callback. It also accepts a `getResetKey` function that can be used to declaratively reset the component's state when the key changes.

### Props

#### `props.getResetKey`

- Type: `() => string`
- Required
- A function that returns a string that will be used to reset the component's state when the key changes.

#### `props.children`

- Type: `JSX.Element`
- Required
- The component's children to render when there is no error

#### `props.errorComponent`

- Type: `JSX.Element`
- Optional - `default: ErrorComponent`
- The component to render when there is an error

#### `props.onCatch`

- Type: `(error: any) => void`
- Optional
- A callback that will be called with the error that was thrown by the component's children

### Returns

- Returns the component's children if there is no error
- Returns the `errorComponent` if there is an error

### Examples

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

# `ErrorComponent` component

The `ErrorComponent` component is a component that renders an error message and optionally the error's message.

### Props

#### `props.error`

- Type: `any`
- Required
- The error that was thrown by the component's children

### Returns

- Returns a formatted error message with the error's message if it exists. The error message can be toggled by clicking the "Show Error" button. By default, the error message shown by default in development.

# `defer` function

The `defer` function wraps a promise with a deferred state object that can be used to inspect the promise's state. This deferred promise can then be passed to the `useAwaited` hook or the `Await` component for suspending until the promise is resolved or rejected.

### Options

#### `_promise`

- Type: `Promise<T>`
- Required
- The promise to wrap with a deferred state object

### Returns

- A `DeferredPromise<T>` that can be passed to the `useAwaited` hook or the `Await` component

### Examples

```tsx
import { defer } from '@tanstack/react-router'

const route = new Route({
  loader: () => {
    const deferredPromise = defer(fetch('/api/data'))
    return { deferredPromise }
  },
  compoennt: MyComponent,
})

function MyComponent() {
  const data = useAwaited({ promise: deferredPromise })

  // or

  return <Await promise={deferredPromise}>{(data) => <div>{data}</div>}</Await>
}
```

# `FileRoutesByPath` type

The `FileRoutesByPath` type is dynamically used with declaration merging to map file paths to their corresponding route and parent route types. These types are then used to create the generated route tree types.

```tsx
export interface FileRoutesByPath {
  // Empty by default, but is dynamically populated by declaration merging during route generation from the generated route tree file.
  // '/': {
  //   parentRoute: typeof rootRoute
  // }
}
```

# `FileRoute` class

The `FileRoute` class is a factory that can be used to create a file-based route instance. This route instance can then be used to automatically generate a route tree with the `tsr generate` and `tsr build` commands.

### `FileRoute` constructor

#### `path`

- Type: `string` literal
- Required, but **automatically inserted and updated by the `tsr generate` and `tsr build` commands**
- The full path of the file that the route will be generated from

### `FileRoute` methods

#### `createRoute` method

The `createRoute` method is a method that can be used to configure the file route instance.

### `createRoute` options

#### `options`

- Type: `Omit<RouteOptions, 'getParentRoute' | 'path' | 'id'>`
- Optional
- The same options that are available to the `Route` class, but with the `getParentRoute`, `path`, and `id` options omitted since they are unnecessary for file-based routing.

### Returns

- A `Route` instance that can be used to create a route tree

> ⚠️ Note: For `tsr generate` and `tsr build` to work properly, the file route instance must be exported from the file using the `Route` identifier.

### Examples

```tsx
import { FileRoute } from '@tanstack/react-router'

export const rootRoute = new FileRoute('/').createRoute({
  loader: () => {
    return 'Hello World'
  },
  component: IndexComponent,
})

function IndexComponent() {
  const data = rootRoute.useLoaderData()
  return <div>{data}</div>
}
```

# `AsyncRouteComponent` type

The `AsyncRouteComponent` type is used to describe a code-split route component that can be preloaded using a `component.preload()` method.

```tsx
type AsyncRouteComponent<TProps> = SyncRouteComponent<TProps> & {
  preload?: () => Promise<void>
}
```

# `lazyRouteComponent` function

The `lazyRouteComponent` function can be used to create a code-split route component that can be preloaded using a `component.preload()` method.

### Options

#### `importer`

- Type: `() => Promise<T>`
- Required
- A function that returns a promise that resolves to an object that contains the component to be loaded

#### `exportName`

- Type: `string`
- Optional
- The name of the component to be loaded from the imported object. Defaults to `'default'`

### Returns

- A `React.lazy` component that can be preloaded using a `component.preload()` method

### Examples

```tsx
import { lazyRouteComponent } from '@tanstack/react-router'

const route = new Route({
  path: '/posts/$postId',
  component: lazyRouteComponent(() => import('./Post')),
})
```

# `NavigateOptions` type

The `NavigateOptions` type is used to describe the options that can be used when describing a navigation action in TanStack Router.

```tsx
type NavigateOptions = ToOptions & {
  replace?: boolean
  resetScroll?: boolean
  startTransition?: boolean
}
```

# `ToOptions` type

The `ToOptions` type contains several properties that can be used to describe a router destination.

```tsx
type ToOptions = {
  from?: ValidRoutePath | string
  to?: ValidRoutePath | string
  hash?: true | ((prev: string) => string)
  state?: true | ((prev: HistoryState) => HistoryState)
} & SearchParamOptions &
  PathParamOptions
```

# `SearchParamOptions` type

The `SearchParamOptions` type is used to describe how search params can be provided or transformed to various navigational APIs in TanStack Router.

```tsx
type SearchParamOptions = {
  search?:
    | true
    | Record<string, TSearchParam>
    | ((prev: TFromSearch) => TToSearch)
}
```

# `PathParamOptions` type

The `PathParamOptions` type is used to describe how path params can be provided or transformed to various navigational APIs in TanStack Router.

```tsx
type PathParamOptions = {
  path?: true | Record<string, TPathParam> | ((prev: TFromParams) => TToParams)
}
```

# `ToMaskOptions` type

The `ToMaskOptions` type extends the `ToOptions` type and describes additional options available when using route masks.

```tsx
type ToMaskOptions = ToOptions & {
  unmaskOnReload?: boolean
}
```

# `useNavigate` hook

The `useNavigate` hook is a hook that returns a `navigate` function that can be used to navigate to a new location. This includes changes to the pathname, search params, hash, and location state.

### Returns

- A `navigate` function that can be used to navigate to a new location

### `navigate` Options

#### `options`

- Type: `NavigateOptions`

### Returns

- A `Promise` that resolves when the navigation is complete

### Examples

```tsx
import { useNavigate } from '@tanstack/react-router'

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

# `Navigate` component

The `Navigate` component is a component that can be used to navigate to a new location when rendered. This includes changes to the pathname, search params, hash, and location state. The underlying navigation will happen inside of a `useEffect` hook when successfully rendered.

### Props

#### `...options`

- Type: `NavigateOptions`

### Returns

#### `null`

### `useLinkProps` hook

The `useLinkProps` hook that takes a `UseLinkPropsOptions` object and returns an `React.AnchorHTMLAttributes<HTMLAnchorElement>` props object. These props can then be safely applied to an anchor element to create a link that can be used to navigate to the new location. This includes changes to the pathname, search params, hash, and location state.

### Options

#### `options`

- Type: `NavigateOptions`

### Returns

- A `React.AnchorHTMLAttributes<HTMLAnchorElement>` object that can be applied to an anchor element to create a link that can be used to navigate to the new location

# `UseLinkPropsOptions` type

The `UseLinkPropsOptions` type the options that can be used to build a `LinkProps` object. It also extends the `React.AnchorHTMLAttributes<HTMLAnchorElement>` type, so that any additional props that are passed to the `useLinkProps` hook will be merged with the `LinkProps` object.

```tsx
type UseLinkPropsOptions = ActiveLinkOptions &
  React.AnchorHTMLAttributes<HTMLAnchorElement>
```

# `ActiveLinkOptions` type

The `ActiveLinkOptions` type extends the `LinkOptions` type and contains additional options that can be used to describe how a link should be styled when it is active.

#### `activeProps`

- `React.AnchorHTMLAttributes<HTMLAnchorElement>`
- Optional
- The props that will be applied to the anchor element when the link is active

#### `inactiveProps`

- Type: `React.AnchorHTMLAttributes<HTMLAnchorElement>`
- Optional
- The props that will be applied to the anchor element when the link is inactive

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

# `LinkOptions` type

The `LinkOptions` type extends the `NavigateOptions` type and contains additional options that can be used by TanStack Router when handling actual anchor element attributes.

### Properties

#### `target`

- Type: `HTMLAnchorElement['target']`
- Optional
- The standard anchor tag target attribute

#### `activeOptions`

- Type: `ActiveOptions`
- Optional
- The options that will be used to determine if the link is active

#### `preload`

- Type: `false | 'intent'`
- Optional
- If set, will preload the linked route on hover and cache it for this many milliseconds in hopes that the user will eventually navigate there.

#### `preloadDelay`

- Type: `number`
- Optional
- Delay intent preloading by this many milliseconds. If the intent exits before this delay, the preload will be cancelled.

#### `disabled`

- Type: `boolean`
- Optional
- If true, will render the link without the href attribute

```tsx
type LinkOptions = NavigateOptions & {
  target?: HTMLAnchorElement['target']
  activeOptions?: ActiveOptions
  preload?: false | 'intent'
  preloadDelay?: number
  disabled?: boolean
}
```

# `Link` component

The `Link` component is a component that can be used to create a link that can be used to navigate to a new location. This includes changes to the pathname, search params, hash, and location state.

### Props

#### `...props`

- Type: `LinkProps & React.RefAttributes<HTMLAnchorElement>`

### Returns

An anchor element that can be used to navigate to a new location.

# `LinkProps` type

The `LinkProps` type extends the `ActiveLinkOptions` and `React.AnchorHTMLAttributes<HTMLAnchorElement>` types and contains additional props specific to the `Link` component.

### Properties

- All of the props from `ActiveLinkOptions`
- All of the props from `React.AnchorHTMLAttributes<HTMLAnchorElement>`

#### `children`

- Type: `React.ReactNode | ((state: { isActive: boolean }) => React.ReactNode)`
- Optional
- The children that will be rendered inside of the anchor element. If a function is provided, it will be called with an object that contains the `isActive` boolean value that can be used to determine if the link is active.

```tsx
type LinkProps = ActiveLinkOptions &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> & {
    children?:
      | React.ReactNode
      | ((state: { isActive: boolean }) => React.ReactNode)
  }
```

# `HistoryState` interface

The `HistoryState` interface is an interface exported by the `history` package that describes the shape of the state object that can be used in conjunction with the `history` package and the `window.location` API.

You can extend this interface to add additional properties to the state object across your application.

```tsx
interface HistoryState {
  key: string // This is the unique ID for any given history entry
}
```

# `ParsedLocation` type

The `ParsedLocation` type represents a parsed location in TanStack Router. It contains a lot of useful information about the current location, including the pathname, search params, hash, location state, and route masking information.

```tsx
interface ParsedLocation {
  href: string
  pathname: string
  search: TFullSearchSchema
  searchStr: string
  state: HistoryState
  hash: string
  maskedLocation?: ParsedLocation
  unmaskOnReload?: boolean
}
```

# `RouteMatch` type

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
  routeContext: Route['routeContext']
  context: Route['allContext']
  search: Route['fullSearchSchema']
  fetchedAt: number
  abortController: AbortController
  cause: 'enter' | 'stay'
}
```

# `AnyRouteMatch` type

The `AnyRouteMatch` type represents a route match in TanStack Router that is not specific to a particular route.

```tsx
type AnyRouteMatch = RouteMatch<any, any>
```

# `Outlet` component

The `Outlet` component is a component that can be used to render the child routes of a parent route. It is used to create nested route trees.

### Props

The `Outlet` component does not accept any props.

### Returns

If matched, the child route match's component/errorComponent/pendingComponent. If not matched, `null`.

# `MatchRouteOptions` type

The `MatchRouteOptions` type is used to describe the options that can be used when matching a route.

### Properties

#### `pending`

- Type: `boolean`
- Optional
- If `true`, will match against pending location instead of the current location

#### `caseSensitive`

- Type: `boolean`
- Optional
- If `true`, will match against the current location with case sensitivity

#### `includeSearch`

- Type: `boolean`
- Optional
- If `true`, will match against the current location's search params using a deep inclusive check. e.g. `{ a: 1 }` will match for a current location of `{ a: 1, b: 2 }`

#### `fuzzy`

- Type: `boolean`
- Optional
- If `true`, will match against the current location using a fuzzy match. e.g. `/posts` will match for a current location of `/posts/123`

```tsx
interface MatchRouteOptions {
  pending?: boolean
  caseSensitive?: boolean
  includeSearch?: boolean
  fuzzy?: boolean
}
```

# `useMatchRoute` hook

The `useMatchRoute` hook is a hook that returns a `matchRoute` function that can be used to match a route against either the current or pending location.

### Returns

- A `matchRoute` function that can be used to match a route against either the current or pending location.

### `matchRoute` Options

#### `options`

- Type: `UseMatchRouteOptions`

### Returns

- The matched route's params or `false` if no route was matched

### Examples

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
```

# `UseMatchRouteOptions` type

The `UseMatchRouteOptions` type extends the `ToOptions` type and describes additional options available when using the `useMatchRoute` hook.

```tsx
export type UseMatchRouteOptions = ToOptions & MatchRouteOptions
```

# `MatchRoute` component

A component version of the `useMatchRoute` hook. It accepts the same options as the `useMatchRoute` with additional props to aid in conditional rendering.

### Props

#### `...props`

- Type: `UseMatchRouteOptions`

#### `children`

- Optional
- `JSX.Element`
  - The component that will be rendered if the route is matched
- ((params: TParams | false) => JSX.Element)`
  - A function that will be called with the matched route's params or `false` if no route was matched. This can be useful for components that need to always render, but render different props based on a route match or not.

### Returns

Either the `children` prop or the return value of the `children` function.

# `useMatch` hook

The `useMatch` hook returns the closest `RouteMatch` in the component tree. The raw route match contains all of the information about a route match in the router and also powers many other hooks under the hood like `useParams`, `useLoaderData`, `useRouteContext`, and `useSearch`.

### Options

#### `opts.from`

- Type: `string`
- The route id of the closest parent match
- Optional, but recommended for full type safety.
- If `opts.strict` is `true`, TypeScript will warn for this option if it is not provided.
- If `opts.strict` is `false`, TypeScript will provided loosened types for the returned `RouteMatch`.

#### `opts.strict`

- Type: `boolean`
- Optional - `default: true`
- If `false`, the `opts.from` option will be ignored and types will be loosened to `Partial<RouteMatch>` to reflect the shared types of all matches.

#### `opts.select`

- Optional
- `(match: RouteMatch) => TSelected`
- If supplied, this function will be called with the route match and the return value will be returned from `useMatch`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.

### Returns

- If a `select` function is provided, the return value of the `select` function.
- If no `select` function is provided, the `RouteMatch` object or a loosened version of the `RouteMatch` object if `opts.strict` is `false`.

# `useMatches` hook

The `useMatches` hook returns all of the `RouteMatch` objects from the router **regardless of its callers position in the React component tree**.

### Options

#### `opts.select`

- Optional
- `(matches: RouteMatch[]) => TSelected`
- If supplied, this function will be called with the route matches and the return value will be returned from `useMatches`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.

### Returns

- If a `select` function is provided, the return value of the `select` function.
- If no `select` function is provided, an array of `RouteMatch` objects.

# `useParentMatches` hook

The `useMatches` hook returns all of the parent `RouteMatch` objects from the router from the callers position in the React component tree.

**⚠️ Note: If the router has pending matches and they are showing their pending component fallbacks, `router.state.pendingMatches` will used instead of `router.state.matches`.**

### Options

#### `opts.select`

- Optional
- `(matches: RouteMatch[]) => TSelected`
- If supplied, this function will be called with the route matches and the return value will be returned from `useMatches`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.

### Returns

- If a `select` function is provided, the return value of the `select` function.
- If no `select` function is provided, an array of `RouteMatch` objects.

# `useLoaderData` hook

The `useLoaderData` hook returns the loader data from the closest `RouteMatch` in the component tree.

### Options

#### `opts.from`

- Type: `string`
- The route id of the closest parent match
- Optional, but recommended for full type safety.
- If `opts.strict` is `true`, TypeScript will warn for this option if it is not provided.
- If `opts.strict` is `false`, TypeScript will provided loosened types for the returned loader data.

#### `opts.strict`

- Type: `boolean`
- Optional - `default: true`
- If `false`, the `opts.from` option will be ignored and types will be loosened to to reflect the shared types of all possible loader data.

#### `opts.select`

- Optional
- `(loaderData: TLoaderData) => TSelected`
- If supplied, this function will be called with the loader data and the return value will be returned from `useLoaderData`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.

### Returns

- If a `select` function is provided, the return value of the `select` function.
- If no `select` function is provided, the loader data or a loosened version of the loader data if `opts.strict` is `false`.

# `redirect` type

The `redirect` type represents a redirect action in TanStack Router.

### Properties

#### `code`

- Type: `number`
- Optional
- The HTTP status code to use when redirecting

#### `throw`

- Type: `any`
- Optional
- If provided, will throw the redirect object instead of returning it. This can be useful in places where `throwing` in a function might cause it to have a return type of `never`. In that case, you can use `redirect({ throw: true })` to throw the redirect object instead of returning it.

```tsx
export type Redirect = {
  code?: number
  throw?: any
} & NavigateOptions
```

# `AnyRedirect` type

The `AnyRedirect` type represents a redirect action in TanStack Router that is not specific to a particular route.

```tsx
export type AnyRedirect = Redirect<any, any, any>
```

# `redirect` function

The `redirect` function returns a new `Redirect` object that can be either returned or thrown from places like a route's `loader` or `beforeLoad` methods to redirect to a new location.

### Options

#### `redirect`

- The `Redirect` options to create the redirect object
- Required

### Returns

- If `redirect.throw` is `true`, the `Redirect` object will be thrown instead of returned.
- Otherwise, the `Redirect` object will be returned.

### Examples

```tsx
import { redirect } from '@tanstack/react-router'

const route = new Route({
  // Returning a redirect object
  loader: () => {
    if (!user) {
      return redirect({
        to: '/login',
      })
    }
  },
  // or throwing a redirect object
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
})
```

# `isRedirect` function

The `isRedirect` function can be used to determine if an object is a redirect object.

### Options

#### `obj`

- The object to check
- Required

### Returns

#### `true` if the object is a redirect object

#### `false` if the object is not a redirect object

### Examples

```tsx
import { isRedirect } from '@tanstack/react-router'

function somewhere(obj: unknown) {
  if (isRedirect(obj)) {
    // ...
  }
}
```

# `RouteOptions` type

The `RouteOptions` type is used to describe the options that can be used when creating a route.

### Properties

#### `getParentRoute`

- Type: `() => TParentRoute`
- Required
- A function that returns the parent route of the route being created. This is required to provide full type safety to child route configurations and to ensure that the route tree is built correctly.

#### `path`

- Type: `string`
- Required, unless an `id` is provided to configure the route as a layout route
- The path segment that will be used to match the route.

#### `id`

- Type: `string`
- Optional, but required if a `path` is not provided
- The unique identifier for the route if it is to be configured as a layout route. If provided, the, the route will not match against the location pathname and its routes will be flattened into its parent route for matching.

#### `validateSearch`

- Type: `(rawSearchParams: unknown) => TSearchSchema`
- Optional
- A function that will be called when this route is matched and passed the raw search params from the current location and return valid parsed search params. If this function throws, the route will be put into an error state and the error will be thrown during render. If this function does not throw, its return value will be used as the route's search params and the return type will be inferred into the rest of the router.

#### `parseParams`

- Type: `(rawParams: Record<string, string>) => TParams`
- Optional
- A function that will be called when this route is matched and passed the raw params from the current location and return valid parsed params. If this function throws, the route will be put into an error state and the error will be thrown during render. If this function does not throw, its return value will be used as the route's params and the return type will be inferred into the rest of the router.

#### `stringifyParams`

- Type: `(params: TParams) => Record<string, string>`
- Required if `parseParams` is provided
- A function that will be called when this routes parsed params are being used to build a location. This function should return a valid object of `Record<string, string>` mapping.

#### `beforeLoad`

```tsx
type beforeLoad = (
  opts: RouteMatch & {
    search: TFullSearchSchema
    abortController: AbortController
    preload: boolean
    params: TAllParams
    context: TParentContext
    location: ParsedLocation
    navigate: NavigateFn<AnyRoute>
    buildLocation: BuildLocationFn<AnyRoute>
    cause: 'enter' | 'stay'
  },
) => Promise<TRouteContext> | TRouteContext | void
```

- Optional
- This async function is called before a route is loaded. If an error is thrown here, the route's loader will not be called and the route will not render. If thrown during a navigation, the navigation will be cancelled and the error will be passed to the `onError` function. If thrown during a preload event, the error will be logged to the console and the preload will fail.
- If this function returns a promise, the route will be put into a pending state and cause rendering to suspend until the promise resolves. If this routes pendingMs threshold is reached, the `pendingComponent` will be shown until it resolved. If the promise rejects, the route will be put into an error state and the error will be thrown during render.
- If this function returns a `TRouteContext` object, that object will be merged into the route's context and be made available in the `loader` and other related route components/methods.
- It's common to use this function to check if a user is authenticated and redirect them to a login page if they are not. To do this, you can either return or throw a `redirect` object from this function.

#### `loader`

```tsx
type loader = (
  opts: RouteMatch & {
    search: TFullSearchSchema
    abortController: AbortController
    preload: boolean
    params: TAllParams
    context: TAllContext
    location: ParsedLocation
    navigate: NavigateFn<AnyRoute>
    buildLocation: BuildLocationFn<AnyRoute>
    cause: 'enter' | 'stay'
  },
) => Promise<TLoaderData> | TLoaderData | void
```

- Optional
- This async function is called when a route is matched and passed the route's match object. If an error is thrown here, the route will be put into an error state and the error will be thrown during render. If thrown during a navigation, the navigation will be cancelled and the error will be passed to the `onError` function. If thrown during a preload event, the error will be logged to the console and the preload will fail.
- If this function returns a promise, the route will be put into a pending state and cause rendering to suspend until the promise resolves. If this routes pendingMs threshold is reached, the `pendingComponent` will be shown until it resolved. If the promise rejects, the route will be put into an error state and the error will be thrown during render.
- If this function returns a `TLoaderData` object, that object will be stored on the route match until the route match is no longer active. It can be accessed using the `useLoaderData` hook in any component that is a child of the route match before another `<Outlet />` is rendered.

#### `loaderDeps`

- Type: `(opts: { search: TFullSearchSchema; location: ParsedLocation, context: TAllContext }) => Record<string, any>`
- Optional
- A function that will be called before this route is matched to provide additional unique identification to the route match and serve as a dependency tracker for when the match should be reloaded. It should return any serializable value that can uniquely identify the route match from navigation to navigation.
- By default, path params are already used to uniquely identify a route match, so it's unnecessary to return these here.
- If your route match relies on search params or context values for unique identification, it's required that you return them here so they can be made available in the `loader`'s `deps` argument.

#### `staleTime`

- Type: `number`
- Optional
- Defaults to `routerOptions.defaultStaleTime`, which defaults to `0`
- The amount of time in milliseconds that a route match's loader data will be considered fresh. If a route match is matched again within this time frame, its loader data will not be reloaded.

#### `preloadStaleTime`

- Type: `number`
- Optional
- Defaults to `routerOptions.defaultPreloadStaleTime`, which defaults to `30_000` ms (30 seconds)
- The amount of time in milliseconds that a route match's loader data will be considered fresh when preloading. If a route match is preloaded again within this time frame, its loader data will not be reloaded. If a route match is loaded (for navigation) within this time frame, the normal `staleTime` is used instead.

#### `gcTime`

- Type: `number`
- Optional
- Defaults to `routerOptions.defaultGcTime`, which defaults to 30 minutes.
- The amount of time in milliseconds that a route match's loader data will be kept in memory after a preload or it is no longer in use.

#### `shouldReload`

- Type: `boolean | ((args: LoaderArgs) => boolean)`
- Optional
- If `false` or returns `false`, the route match's loader data will not be reloaded on subsequent matches.
- If `true` or returns `true`, the route match's loader data will be reloaded on subsequent matches.
- If `undefined` or returns `undefined`, the route match's loader data will adhere to the default stale-while-revalidate behavior.

#### `caseSensitive`

- Type: `boolean`
- Optional
- If `true`, this route will be matched as case-sensitive

#### `wrapInSuspense`

- Type: `boolean`
- Optional
- If `true`, this route will be forcefully wrapped in a suspense boundary, regardless if a reason is found to do so from inspecting its provided components.

#### `pendingMs`

- Type: `number`
- Optional
- Defaults to `routerOptions.defaultPendingMs`, which defaults to `1000`
- The threshold in milliseconds that a route must be pending before its `pendingComponent` is shown.

#### `pendingMinMs`

- Type: `number`
- Optional
- Defaults to `routerOptions.defaultPendingMinMs` which defaults to `500`
- The minimum amount of time in milliseconds that the pending component will be shown for if it is shown. This is useful to prevent the pending component from flashing on the screen for a split second.

#### `preloadMaxAge`

- Type: `number`
- Optional
- Defaults to `30_000` ms (30 seconds)
- The maximum amount of time in milliseconds that a route's preloaded route data will be cached for. If a route is not matched within this time frame, its loader data will be discarded.

#### `preSearchFilters`

- Type: `((search: TFullSearchSchema) => TFullSearchSchema)[]`
- Optional
- An array of functions that will be called when generating any new links to this route or its grandchildren.
- Each function will be called with the current search params and should return a new search params object that will be used to generate the link.
- It has a `pre` prefix because it is called before the user-provided function that is passed to `navigate`/`Link` etc has a chance to modify the search params.

#### `postSearchFilters`

- Type: `((search: TFullSearchSchema) => TFullSearchSchema)[]`
- Optional
- An array of functions that will be called when generating any new links to this route or its grandchildren.
- Each function will be called with the current search params and should return a new search params object that will be used to generate the link.
- It has a `post` prefix because it is called after the user-provided function that is passed to `navigate`/`Link` etc has modified the search params.

#### `onError`

- Type: `(error: unknown) => void`
- Optional
- A function that will be called when an error is thrown during a navigation or preload event.
- If this function returns a `redirect` object, the redirect will be applied immediately.

#### `onEnter`

- Type: `(match: RouteMatch) => void`
- Optional
- A function that will be called when a route is matched and loaded after not being matched in the previous location.

#### `onStay`

- Type: `(match: RouteMatch) => void`
- Optional
- A function that will be called when a route is matched and loaded after being matched in the previous location.

#### `onLeave`

- Type: `(match: RouteMatch) => void`
- Optional
- A function that will be called when a route is no longer matched after being matched in the previous location.

#### `component`

- Type: `RouteComponent` or `LazyRouteComponent`
- Optional - Defaults to `<Outlet />`
- The content to be rendered when the route is matched.

#### `errorComponent`

- Type: `RouteComponent` or `LazyRouteComponent`
- Optional - Defaults to `routerOptions.defaultErrorComponent`
- The content to be rendered when the route encounters an error.

#### `pendingComponent`

- Type: `RouteComponent` or `LazyRouteComponent`
- Optional - Defaults to `routerOptions.defaultPendingComponent`
- The content to be rendered if and when the route is pending and has reached its pendingMs threshold.

# `Route` class

The `Route` class implements the `RouteApi` class and can be used to create route instances. A route instance can then be used to create a route tree.

### `Route` constructor

#### `options`

- Type: `RouteOptions`
- Required
- The options that will be used to configure the route instance

### `Route` methods

#### `addChildren`

- Type: `(children: Route[]) => this`
- Adds child routes to the route instance and returns the route instance (but with updated types to reflect the new children)

#### `update`

- Type: `(options: Partial<UpdatableRouteOptions>) => this`
- Updates the route instance with new options and returns the route instance (but with updated types to reflect the new options)
- In some circumstances, it can be useful to update a route instance's options after it has been created to avoid circular type references.
- ...`RouteApi` methods
  - All of the methods from the `RouteApi` class are available on the `Route` class

# `RouteApi` class

The `RouteApi` class provides type-safe version of common hooks like `useParams`, `useLoaderData`, `useRouteContext`, and `useSearch` that are pre-bound to a specific route ID and corresponding registered route types.

### `RouteApi` constructor

#### `opts.routeId`

- Type: `string`
- Required
- The route ID to which the `RouteApi` instance will be bound

### `RouteApi` methods

#### `useMatch`

```tsx
  useMatch<TSelected = TAllContext>(opts?: {
    select?: (search: TAllContext) => TSelected
  }): TSelected
```

- A type-safe version of the `useMatch` hook that is pre-bound to the route ID that the `RouteApi` instance was created with.
- Options
  - `opts.select`
    - Optional
    - `(match: RouteMatch) => TSelected`
    - If supplied, this function will be called with the route match and the return value will be returned from `useMatch`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.
- Returns
  - If a `select` function is provided, the return value of the `select` function.
  - If no `select` function is provided, the `RouteMatch` object or a loosened version of the `RouteMatch` object if `opts.strict` is `false`.

#### `useRouteContext`

```tsx
  useRouteContext<TSelected = TAllContext>(opts?: {
    select?: (search: TAllContext) => TSelected
  }): TSelected
```

- A type-safe version of the `useRouteContext` hook that is pre-bound to the route ID that the `RouteApi` instance was created with.
- Options
  - `opts.select`
    - Optional
    - `(match: RouteContext) => TSelected`
    - If supplied, this function will be called with the route match and the return value will be returned from `useRouteContext`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.
- Returns
  - If a `select` function is provided, the return value of the `select` function.
  - If no `select` function is provided, the `RouteContext` object or a loosened version of the `RouteContext` object if `opts.strict` is `false`.

#### `useSearch`

```tsx
  useSearch<TSelected = TFullSearchSchema>(opts?: {
    select?: (search: TFullSearchSchema) => TSelected
  }): TSelected
```

- A type-safe version of the `useSearch` hook that is pre-bound to the route ID that the `RouteApi` instance was created with.
- Options
  - `opts.select`
    - Optional
    - `(match: TFullSearchSchema) => TSelected`
    - If supplied, this function will be called with the route match and the return value will be returned from `useSearch`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.
- Returns
  - If a `select` function is provided, the return value of the `select` function.
  - If no `select` function is provided, the `TFullSearchSchema` object or a loosened version of the `TFullSearchSchema` object if `opts.strict` is `false`.

#### `useParams`

```tsx
  useParams<TSelected = TAllParams>(opts?: {
    select?: (search: TAllParams) => TSelected
  }): TSelected
```

- A type-safe version of the `useParams` hook that is pre-bound to the route ID that the `RouteApi` instance was created with.
- Options
  - `opts.select`
    - Optional
    - `(match: TAllParams) => TSelected`
    - If supplied, this function will be called with the route match and the return value will be returned from `useParams`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.
- Returns
  - If a `select` function is provided, the return value of the `select` function.
  - If no `select` function is provided, the `TAllParams` object or a loosened version of the `TAllParams` object if `opts.strict` is `false`.

#### `useLoaderData`

```tsx
  useLoaderData<TSelected = TLoaderData>(opts?: {
    select?: (search: TLoaderData) => TSelected
  }): TSelected
```

- A type-safe version of the `useLoaderData` hook that is pre-bound to the route ID that the `RouteApi` instance was created with.
- Options
  - `opts.select`
    - Optional
    - `(match: TLoaderData) => TSelected`
    - If supplied, this function will be called with the route match and the return value will be returned from `useLoaderData`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.
- Returns
  - If a `select` function is provided, the return value of the `select` function.
  - If no `select` function is provided, the `TLoaderData` object or a loosened version of the `TLoaderData` object if `opts.strict` is `false`.

# `RootRoute` class

The `RootRoute` class extends the `Route` class and can be used to create a root route instance. A root route instance can then be used to create a route tree.

### `RootRoute` constructor

#### `options`

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

- Required
- The options that will be used to configure the root route instance

### `RootRoute` methods

#### `addChildren`

- Type: `(children: Route[]) => this`
- Adds child routes to the root route instance and returns the root route instance (but with updated types to reflect the new children)

#### `update`

- Type: `(options: Partial<UpdatableRouteOptions>) => this`
- Updates the root route instance with new options and returns the root route instance (but with updated types to reflect the new options)
- In some circumstances, it can be useful to update a root route instance's options after it has been created to avoid circular type references.

# `rootRouteWithContext` function

The `rootRouteWithContext` function is a helper function that can be used to create a root route instance that requires a context type to be fulfilled when the router is created.

### Generics

#### `TRouterContext`

- The context type that will be required to be fulfilled when the router is created

### Options

- No options are available for this function

### Returns

- A `RootRoute` factory function that can be used to create a root route instance

### Examples

```tsx
import { rootRouteWithContext } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'

const rootRoute = rootRouteWithContext<{ queryClient: QueryClient }>()({
  // ... Route Options
})

const queryClient = new QueryClient()

const router = createRouter({
  routes: [rootRoute],
  context: {
    queryClient,
  },
})
```

# `RouteMask` type

The `RouteMask` type extends the ToOptions type and has other the necessary properties to create a route mask.

### Properties

#### `...ToOptions`

- Type: `ToOptions`
- Required
- The options that will be used to configure the route mask

#### `options.routeTree`

- Type: `TRouteTree`
- Required
- The route tree that this route mask will support

#### `options.unmaskOnReload`

- Type: `boolean`
- Optional
- If `true`, the route mask will be removed when the page is reloaded

# `createRouteMask` function

The `createRouteMask` function is a helper function that can be used to create a route mask configuration that can be passed to the `routerOptions.routeMasks` option.

### Options

#### `options`

- Type: `RouteMask`
- Required
- The options that will be used to configure the route mask

### Returns

- A `RouteMask` object that can be passed to the `routerOptions.routeMasks` option.

### Examples

```tsx
import { createRouteMask, Router } from '@tanstack/react-router'

const photoModalToPhotoMask = createRouteMask({
  routeTree,
  from: '/photos/$photoId/modal',
  to: '/photos/$photoId',
  params: true,
})

// Set up a Router instance
const router = new Router({
  routeTree,
  routeMasks: [photoModalToPhotoMask],
})
```

# `NotFoundRoute` class

The `NotFoundRoute` class extends the `Route` class and can be used to create a not found route instance. A not found route instance can be pased to the `routerOptions.notFoundRoute` option to configure a default not-found/404 route for every branch of the route tree.

### `NotFoundRoute` constructor

#### `options`

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

- Required
- The options that will be used to configure the not found route instance

# `ParseRoute` type

This type recursively parses a route and all of its children and grandchildren into a single union of all possible routes.

```tsx
export type ParseRoute<TRouteTree extends AnyRoute> =
  | TRouteTree
  | ParseRouteChildren<TRouteTree>
```

# `ParseRouteChildren` type

This type recursively parses a route's children and grandchildren into a single union of all possible routes.

# `RoutesById` type

This type takes a route tree and returns a Record of all routes in the tree keyed by their route ID.

```tsx
export type RoutesById<TRouteTree extends AnyRoute> = {
  [K in ParseRoute<TRouteTree> as K['id']]: K
}
```

### Example

```tsx
import { RoutesById } from '@tanstack/react-router'

type Routes = RoutesById<typeof routeTree>
```

# `RouteById` type

This type takes a route tree and a route ID and returns the route in the tree that matches the ID.

```tsx
export type RouteById<TRouteTree extends AnyRoute, TId> = Extract<
  ParseRoute<TRouteTree>,
  { id: TId }
>
```

### Example

```tsx
import { RouteById } from '@tanstack/react-router'

type Route = RouteById<typeof routeTree, '/auth/posts'>
```

# `RouteIds` type

This type takes a route tree and returns a union of all of the route IDs in the tree.

```tsx
export type RouteIds<TRouteTree extends AnyRoute> = ParseRoute<TRouteTree>['id']
```

### Example

```tsx
import { RouteIds } from '@tanstack/react-router'

type RouteId = RouteIds<typeof routeTree>
```

# `RoutesByPath` type

This type takes a route tree and returns a Record of all routes in the tree keyed by their full path.

```tsx
export type RoutesByPath<TRouteTree extends AnyRoute> = {
  [K in ParseRoute<TRouteTree> as K['fullPath']]: K
}
```

### Example

```tsx
import { RoutesByPath } from '@tanstack/react-router'

type Routes = RoutesByPath<typeof routeTree>
```

# `RouteByPath` type

This type takes a route tree and a path and returns the route in the tree that matches the path.

```tsx
export type RouteByPath<TRouteTree extends AnyRoute, TPath> = Extract<
  ParseRoute<TRouteTree>,
  { fullPath: TPath }
>
```

### Example

```tsx
import { RouteByPath } from '@tanstack/react-router'

type Route = RouteByPath<typeof routeTree, '/posts'>
```

# `RoutePaths` type

This type takes a route tree and returns a union of all of the full paths in the tree.

```tsx
export type RoutePaths<TRouteTree extends AnyRoute> =
  | ParseRoute<TRouteTree>['fullPath']
  | '/'
```

### Example

```tsx
import { RoutePaths } from '@tanstack/react-router'

type RoutePath = RoutePaths<typeof routeTree>
```

# `FullSearchSchema` type

This type takes a route tree and returns an expanded, optional intersection of all search schemas in the tree.

```tsx
export type FullSearchSchema<TRouteTree extends AnyRoute> = Partial<
  Expand<
    UnionToIntersection<ParseRoute<TRouteTree>['types']['fullSearchSchema']>
  >
>
```

### Example

```tsx
import { FullSearchSchema } from '@tanstack/react-router'

type SearchSchema = FullSearchSchema<typeof routeTree>
```

# `AllParams` type

This type takes a route tree and returns an expanded, optional intersection of all params in the tree.

```tsx
export type AllParams<TRouteTree extends AnyRoute> = Expand<
  UnionToIntersection<ParseRoute<TRouteTree>['types']['allParams']>
>
```

### Example

```tsx
import { AllParams } from '@tanstack/react-router'

type Params = AllParams<typeof routeTree>
```

# `Register` type

This type is used to register a route tree with a router instance. Doing so unlocks the full type safety of TanStack Router, including top-level exports from the `@tanstack/react-router` package.

```tsx
export type Register = {
  // router: [Your router type here]
}
```

To register a route tree with a router instance, use declaration merging to add the type of your router instance to the Register interface under the `router` property:

```tsx
const router = new Router({
  // ...
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```

# `RegisteredRouter` type

This type is used to get the type of a registered router instance, if one has been registered.

### Example

```tsx
import { RegisteredRouter } from '@tanstack/react-router'

type Router = RegisteredRouter
// This will be the type of the router instance that was registered via declaration merging or AnyRouter if no router instance has been registered.
```

# `RouterOptions` type

The `RouterOptions` type contains all of the options that can be used to configure a router instance.

### Properties

#### `routeTree`

- Type: `AnyRoute`
- Required
- The route tree that will be used to configure the router instance.

#### `history`

- Type: `RouterHistory`
- Optional
- The history object that will be used to manage the browser history. If not provided, a new `createBrowserHistory` instance will be created and used.

#### `stringifySearch`

- Type: `(search: Record<string, any>) => string`
- Optional
- A function that will be used to stringify search params when generating links.
- Defaults to `defaultStringifySearch`

#### `parseSearch`

- Type: `(search: string) => Record<string, any>`
- Optional
- A function that will be used to parse search params when parsing the current location.
- Defaults to `defaultParseSearch`

#### `defaultPreload`

- Type: `undefined | false | 'intent'`
- Optional
- Defaults to `false`
- If `false`, routes will not be preloaded by default in any way
- If `'intent'`, routes will be preloaded by default when the user hovers over a link or a touchstart event is detected on a link

#### `defaultPreloadDelay`

- Type: `number`
- Optional
- Defaults to `50`
- The delay in milliseconds that a route must be hovered over or touched before it is preloaded

#### `defaultComponent`

- Type: `RouteComponent`
- Optional
- Defaults to `Outlet`
- The default `component` a route should use if no component is provided

#### `defaultErrorComponent`

- Type: `RouteComponent`
- Optional
- Defaults to `ErrorComponent`
- The default `errorComponent` a route should use if no error component is provided

#### `defaultPendingComponent`

- Type: `RouteComponent`
- Optional
- The default `pendingComponent` a route should use if no pending component is provided

#### `defaultPendingMs`

- Type: `number`
- Optional
- Defaults to `1000`
- The default `pendingMs` a route should use if no pendingMs is provided

#### `defaultPendingMinMs`

- Type: `number`
- Optional
- Defaults to `500`
- The default `pendingMinMs` a route should use if no pendingMinMs is provided

#### `caseSensitive`

- Type: `boolean`
- Optional
- Defaults to `false`
- If `true`, all routes will be matched as case-sensitive

#### `basepath`

- Type: `string`
- Optional
- Defaults to `/`
- The basepath for then entire router. This is useful for mounting a router instance at a subpath.

#### `context`

- Type: `any`
- Optional or required if the root route was created with `rootRouteWithContext()`.
- The root context that will be provided to all routes in the route tree. This can be used to provide a context to all routes in the tree without having to provide it to each route individually.

#### `dehydrate`

- Type: `() => TDehydrated`
- Optional
- A function that will be called when the router is dehydrated. The return value of this function will be serialized and stored in the router's dehydrated state.

#### `hydrate`

- Type: `(dehydrated: TDehydrated) => void`
- Optional
- A function that will be called when the router is hydrated. The return value of this function will be serialized and stored in the router's dehydrated state.

#### `routeMasks`

- Type: `RouteMask[]`
- Optional
- An array of route masks that will be used to mask routes in the route tree. Route masking is when you display a route at a different path than the one it is configured to match, like a modal popup that when shared will unmask to the modal's content instead of the modal's context.

#### `unmaskOnReload`

- Type: `boolean`
- Optional
- Defaults to `false`
- If `true`, route masks will, by default, be removed when the page is reloaded. This can be overridden on a per-mask basis by setting the `unmaskOnReload` option on the mask, or on a per-navigation basis by setting the `unmaskOnReload` option in the `Navigate` options.

#### `Wrap`

- Type: `React.Component`
- Optional
- A component that will be used to wrap the entire router. This is useful for providing a context to the entire router.

**Example**

```tsx
import { Router } from '@tanstack/react-router'

const router = new Router({
  // ...
  Wrap: ({ children }) => {
    return <MyContext.Provider value={myContext}>{children}</MyContext>
  },
})
```

#### `InnerWrap`

- Type: `React.Component`
- Optional
- A component that will be used to wrap the inner contents of the router. This is useful for providing a context to the inner contents of the router where you also need access to the router context and hooks.

**Example**

```tsx
import { Router } from '@tanstack/react-router'

const router = new Router({
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

#### `notFoundRoute`

- Type: `NotFoundRoute`
- Optional
- A route that will be used as the default not found route for every branch of the route tree. This can be overridden on a per-branch basis by providing a not found route to the `NotFoundRoute` option on the root route of the branch.

# `RouterState` type

The `RouterState` type contains all of the properties that are available on the router state.

### Properties

#### `status`

- Type: `'pending' | 'idle'`
- The current status of the router. If the router is pending, it means that it is currently loading a route or the router is still transitioning to the new route.

#### `isLoading`

- Type: `boolean`
- `true` if the router is currently loading a route or waiting for a route to finish loading.

#### `isTransitioning`

- Type: `boolean`
- `true` if the router is currently transitioning to a new route.

#### `matches`

- Type: `RouteMatch[]`
- An array of all of the route matches that have been resolved and are currently active.

#### `pendingMatches`

- Type: `RouteMatch[]`
- An array of all of the route matches that are currently pending.

#### `location`

- Type: `ParsedLocation`
- The latest location that the router has parsed from the browser history. This location may not be resolved and loaded yet.

#### `resolvedLocation`

- Type: `ParsedLocation`
- The location that the router has resolved and loaded.

#### `lastUpdated`

- Type: `number`
- The timestamp of the last time the router was resolved.

# `RouterEvents` type

The `RouterEvents` type contains all of the events that the router can emit.

### Properties

Each property on this type is an event that the router can emit. The value of each property is an object that contains the following properties:

#### `type`

- Type: `onBeforeLoad | onLoad | onResolved`
- The type of the event
- This is useful for discriminating between events in a listener function

#### `fromLocation`

- Type: `ParsedLocation`
- The location that the router is transitioning from

#### `toLocation`

- Type: `ParsedLocation`
- The location that the router is transitioning to

#### `pathChanged`

- Type: `boolean`
- `true` if the path has changed between the `fromLocation` and `toLocation`

# `Router` class

The `Router` class is used to create a router instance.

### `Router` constructor

#### `options`

- Type: `RouterOptions`
- Required
- The options that will be used to configure the router instance

### `Router` properties and methods

#### `update`

- Type: `(newOptions: RouterOptions) => void`
- Updates the router instance with new options

#### `state`

- Type: `RouterState`
- The current state of the router

> ⚠️⚠️⚠️ **`router.state` is always up to date, but NOT REACTIVE. If you use `router.state` in a component, the component will not re-render when the router state changes. To get a reactive version of the router state, use the `useRouterState` hook.**

#### `subscribe`

- Type: `(eventType: TType, fn: ListenerFn<RouterEvents[TType]>) => (event: RouterEvent) => void`
- Subscribes to a router event
- Returns a function that can be used to unsubscribe from the event
- The callback provided to the returned function will be called with the event that was emitted

#### `matchRoutes`

- Type: `(pathname: string, locationSearch: Record<string, any>, opts?: { throwOnError?: boolean; }) => RouteMatch[]`
- Matches a pathname and search params against the router's route tree and returns an array of route matches
- If `opts.throwOnError` is `true`, any errors that occur during the matching process will be thrown (in addition to being returned in the route match's `error` property).

#### `cancelMatch`

- Type: `(matchId: string) => void`
- Cancels a route match that is currently pending by calling `match.abortController.abort()`.

#### `cancelMatches`

- Type: `() => void`
- Cancels all route matches that are currently pending by calling `match.abortController.abort()` on each one.

#### `buildLocation`

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
    - Type: `true | NonNullableUpdater<HistoryState>`
    - Optional
    - If `true`, the current state will be used. If a function is provided, it will be called with the current state and the return value will be used.
  - `mask`
    - Type: `object`
    - Optional
    - Contains all of the same BuildNextOptions, with the addition of `unmaskOnReload`
    - `unmaskOnReload`
      - Type: `boolean`
      - Optional
      - If `true`, the route mask will be removed when the page is reloaded. This can be overridden on a per-navigation basis by setting the `unmaskOnReload` option in the `Navigate` options.

#### `commitLocation`

Commits a new location object to the browser history.

- Type
  ```tsx
  type commitLocation = (
    location: ParsedLocation & {
      replace?: boolean
      resetScroll?: boolean
      startTransition?: boolean
    },
  ) => Promise<void>
  ```
- Properties
  - `location`
    - Type: `ParsedLocation`
    - Required
    - The location to commit to the browser history
  - `replace`
    - Type: `boolean`
    - Optional
    - Defaults to `false`
    - If `true`, the location will be committed to the browser history using `history.replace` instead of `history.push`
  - `resetScroll`
    - Type: `boolean`
    - Optional
    - Defaults to `true` so that the scroll position will be reset to 0,0 after the location is committed to the browser history.
    - If `false`, the scroll position will not be reset to 0,0 after the location is commited to history.
  - `startTransition`
    - Type: `boolean`
    - Optional
    - Defaults to `true`, so that the router will apply the commit wrapped in a React `startTransition` call.
    - If `false`, the router will not wrap the commit in a React `startTransition` call.

#### `navigate`

Navigates to a new location.

- Type
  ```tsx
  type navigate = (options: NavigateOptions) => Promise<void>
  ```

#### `invalidate`

Invalidates all route matches by forcing their `beforeLoad` and `load` functions to be called again.

- Type: `() => void`
- This is useful any time your loader data might possibly be out of date or stale. For example, if you have a route that displays a list of posts, and you have a loader function that fetches the list of posts from an API, you might want to invalidate the route matches for that route any time a new post is created so that the list of posts is always up to date.

#### `load`

Loads all of the currently matched route matches and resolves when they are all loaded and ready to be rendered.

> ⚠️⚠️⚠️ **`router.load()` respects `route.staleTime` and will not forcefully reload a route match if it is still fresh. If you need to forcefully reload a route match, use `router.invalidate()` instead.**

- Type: `() => Promise<void>`
- The most common use case for this method is to call it when doing SSR to ensure that all of the critical data for the current route is loaded before attempting to stream or render the application to the client.

#### `preloadRoute`

Preloads all of the matches that match the provided `NavigateOptions`.

> ⚠️⚠️⚠️ **Preloaded route matches are not stored long-term in the router state. They are only stored until the next attempted navigation action.**

- Type: `(opts?: NavigateOptions) => Promise<RouteMatch[]>`
- Properties
  - `opts`
    - Type: `NavigateOptions`
    - Optional, defaults to the current location
    - The options that will be used to determine which route matches to preload
- Returns
  - A promise that resolves with an array of all of the route matches that were preloaded

#### `matchRoute`

Matches a pathname and search params against the router's route tree and returns a route match's params or false if no match was found.

- Type: `(dest: ToOptions, matchOpts?: MatchRouteOptions) => RouteMatch | false`
- Properties
  - `dest`
    - Type: `ToOptions`
    - Required
    - The destination to match against
  - `matchOpts`
    - Type: `MatchRouteOptions`
    - Optional
    - Options that will be used to match the destination
- Returns
  - A route match object if a match was found
  - `false` if no match was found

#### `injectHtml`

Injects the HTML for the router into the DOM.

- Type: `(html: string | (() => Promise<string> | string)) => void`
- Properties
  - `html`
    - Type: `string | (() => Promise<string> | string)`
    - Required
    - The HTML to inject into the DOM
    - If a function is provided, it will be called and the resolved value will be injected into the DOM

#### `dehydrateData`

Dehydrates data into the router on the server that can be streamed to the client and rehydrated later.

- Type: `<T>(key: any, getData: T | (() => Promise<T> | T)) => () => void`
- Properties
  - `key`
    - Type: `any`
    - Required
    - The key that will be used to identify the dehydrated data
  - `getData`
    - Type: `T | (() => Promise<T> | T)`
    - Required
    - The data that will be dehydrated
    - If a function is provided, it will be called and the resolved value will be dehydrated

#### `hydrateData`

Hydrates data into the router on the client that was dehydrated on the server.

- Type: `<T>(key: any) => T | undefined`
- Properties
  - `key`
    - Type: `any`
    - Required
    - The key that was used to identify the dehydrated data
- Returns
  - The dehydrated data if it exists
  - `undefined` if the dehydrated data does not exist

#### `dehydrate`

Dehydrates the router's critical state into a serializable object that can be sent to the client in an initial request.

- Type: `() => DehydratedRouter`
- Returns
  - A serializable object that contains the router's critical state

#### `hydrate`

Hydrates the router's critical state from a serializable object that was sent from the server in an initial request.

- Type: `(dehydrated: DehydratedRouter) => void`
- Properties
  - `dehydrated`
    - Type: `DehydratedRouter`
    - Required
    - The dehydrated router state that was sent from the server
