---
id: api
title: API Reference
---

# `useParams`

The `useParams` method returns all of the path parameters that were parsed for the closest match and all of its parent matches.

### Options

- `opts.strict`
  - `boolean`
  - Optional - `default: true`
  - If `false`, the `opts.from` option will be ignored and types will be loosened to `Partial<AllParams>` to reflect the shared types of all params.
- `opts.select`
  - Optional
  - `(params: AllParams) => TSelected`
  - If supplied, this function will be called with the params object and the return value will be returned from `useParams`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.

### Returns

- An object of of the match's and parent match path params or `TSelected` if a `select` function is provided.

### Examples

```tsx
import { useParams } from '@tanstack/react-router'

function Component() {
  const params = myRoute.useParams({ from: '/posts/:postId' })

  // OR

  const postId = myRoute.useParams({
    from: '/posts/:postId',
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

- `opts.promise`
  - `DeferredPromise<T>`
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

- `props.promise`
  - `DeferredPromise<T>`
  - Required
  - The deferred promise to await
- `props.children`
  - `(result: T) => JSX.Element`
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

- `props.getResetKey`
  - `() => string`
  - Required
  - A function that returns a string that will be used to reset the component's state when the key changes.
- `props.children`
  - `JSX.Element`
  - Required
  - The component's children to render when there is no error
- `props.errorComponent`
  - `JSX.Element`
  - Optional - `default: ErrorComponent`
  - The component to render when there is an error
- `props.onCatch`
  - `(error: any) => void`
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

- `props.error`
  - `any`
  - Required
  - The error that was thrown by the component's children

### Returns

- Returns a formatted error message with the error's message if it exists. The error message can be toggled by clicking the "Show Error" button. By default, the error message shown by default in development.

# `defer` function

The `defer` function wraps a promise with a deferred state object that can be used to inspect the promise's state. This deferred promise can then be passed to the `useAwaited` hook or the `Await` component for suspending until the promise is resolved or rejected.

### Options

- `_promise`
  - `Promise<T>`
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

- `path`
  - `string` literal
  - Required, but **automatically inserted and updated by the `tsr generate` and `tsr build` commands**
  - The full path of the file that the route will be generated from

### `FileRoute` methods

#### `createRoute` method

The `createRoute` method is a method that can be used to configure the file route instance.

### `createRoute` options

- `options`
  - `Omit<RouteOptions, 'getParentRoute' | 'path' | 'id'>`
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

- `importer`
  - `() => Promise<T>`
  - Required
  - A function that returns a promise that resolves to an object that contains the component to be loaded
- `exportName`
  - `string`
  - Optional
  - The name of the component to be loaded from the imported object. Defaults to `'default'`

### Returns

- A `React.lazy` component that can be preloaded using a `component.preload()` method

### Examples

```tsx
import { lazyRouteComponent } from '@tanstack/react-router'

const route = new Route({
  path: '/posts/:postId',
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

- `options`
  - `NavigateOptions`

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

- `...options`
  - `NavigateOptions`

### Returns

- `null`

### `useLinkProps` hook

The `useLinkProps` hook that takes a `UseLinkPropsOptions` object and returns an `React.AnchorHTMLAttributes<HTMLAnchorElement>` props object. These props can then be safely applied to an anchor element to create a link that can be used to navigate to the new location. This includes changes to the pathname, search params, hash, and location state.

### Options

- `options`
  - `NavigateOptions`

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

- `activeProps`

  - `React.AnchorHTMLAttributes<HTMLAnchorElement>`
  - Optional
  - The props that will be applied to the anchor element when the link is active

- `inactiveProps`
  - `React.AnchorHTMLAttributes<HTMLAnchorElement>`
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

- `target`
  - `HTMLAnchorElement['target']`
  - Optional
  - The standard anchor tag target attribute
- `activeOptions`
  - `ActiveOptions`
  - Optional
  - The options that will be used to determine if the link is active
- `preload`
  - `false | 'intent'`
  - Optional
  - If set, will preload the linked route on hover and cache it for this many milliseconds in hopes that the user will eventually navigate there.
- `preloadDelay`
  - `number`
  - Optional
  - Delay intent preloading by this many milliseconds. If the intent exits before this delay, the preload will be cancelled.
- `disabled`
  - `boolean`
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

- `...props`
  - `LinkProps & React.RefAttributes<HTMLAnchorElement>`

### Returns

An anchor element that can be used to navigate to a new location.

# `LinkProps` type

The `LinkProps` type extends the `ActiveLinkOptions` and `React.AnchorHTMLAttributes<HTMLAnchorElement>` types and contains additional props specific to the `Link` component.

### Properties

- All of the props from `ActiveLinkOptions`
- All of the props from `React.AnchorHTMLAttributes<HTMLAnchorElement>`
- `children`
  - `React.ReactNode | ((state: { isActive: boolean }) => React.ReactNode)`
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
  shouldReloadDeps: any
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

- `pending`
  - `boolean`
  - Optional
  - If `true`, will match against pending location instead of the current location
- `caseSensitive`
  - `boolean`
  - Optional
  - If `true`, will match against the current location with case sensitivity
- `includeSearch`
  - `boolean`
  - Optional
  - If `true`, will match against the current location's search params using a deep inclusive check. e.g. `{ a: 1 }` will match for a current location of `{ a: 1, b: 2 }`
- `fuzzy`
  - `boolean`
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

- `options`
  - `UseMatchRouteOptions`

### Returns

- The matched route's params or `false` if no route was matched

### Examples

```tsx
import { useMatchRoute } from '@tanstack/react-router'

// Current location: /posts/123
function Component() {
  const matchRoute = useMatchRoute()
  const params = matchRoute({ to: '/posts/:postId' })
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

- `...props`
  - `UseMatchRouteOptions`
- `children`
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

- `opts.from`
  - `string`
  - The route id of the closest parent match
  - Optional, but recommended for full type safety.
  - If `opts.strict` is `true`, TypeScript will warn for this option if it is not provided.
  - If `opts.strict` is `false`, TypeScript will provided loosened types for the returned `RouteMatch`.
- `opts.strict`
  - `boolean`
  - Optional - `default: true`
  - If `false`, the `opts.from` option will be ignored and types will be loosened to `Partial<RouteMatch>` to reflect the shared types of all matches.
- `opts.select`
  - Optional
  - `(match: RouteMatch) => TSelected`
  - If supplied, this function will be called with the route match and the return value will be returned from `useMatch`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.

### Returns

- If a `select` function is provided, the return value of the `select` function.
- If no `select` function is provided, the `RouteMatch` object or a loosened version of the `RouteMatch` object if `opts.strict` is `false`.

# `useMatches` hook

The `useMatches` hook returns all of the `RouteMatch` objects from the router **regardless of its callers position in the React component tree**.

### Options

- `opts.select`
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

- `opts.select`
  - Optional
  - `(matches: RouteMatch[]) => TSelected`
  - If supplied, this function will be called with the route matches and the return value will be returned from `useMatches`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.

### Returns

- If a `select` function is provided, the return value of the `select` function.
- If no `select` function is provided, an array of `RouteMatch` objects.

# `useLoaderData` hook

The `useLoaderData` hook returns the loader data from the closest `RouteMatch` in the component tree.

### Options

- `opts.from`
  - `string`
  - The route id of the closest parent match
  - Optional, but recommended for full type safety.
  - If `opts.strict` is `true`, TypeScript will warn for this option if it is not provided.
  - If `opts.strict` is `false`, TypeScript will provided loosened types for the returned loader data.
- `opts.strict`
  - `boolean`
  - Optional - `default: true`
  - If `false`, the `opts.from` option will be ignored and types will be loosened to to reflect the shared types of all possible loader data.
- `opts.select`
  - Optional
  - `(loaderData: TLoaderData) => TSelected`
  - If supplied, this function will be called with the loader data and the return value will be returned from `useLoaderData`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.

### Returns

- If a `select` function is provided, the return value of the `select` function.
- If no `select` function is provided, the loader data or a loosened version of the loader data if `opts.strict` is `false`.

# `redirect` type

The `redirect` type represents a redirect action in TanStack Router.

### Properties

- `code`
  - `number`
  - Optional
  - The HTTP status code to use when redirecting
- `throw`
  - `any`
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

- `redirect`
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

- `obj`
  - The object to check
  - Required

### Returns

- `true` if the object is a redirect object
- `false` if the object is not a redirect object

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

- `getParentRoute`
  - `() => TParentRoute`
  - Required
  - A function that returns the parent route of the route being created. This is required to provide full type safety to child route configurations and to ensure that the route tree is built correctly.
- `path`
  - `string`
  - Required, unless an `id` is provided to configure the route as a layout route
  - The path segment that will be used to match the route.
- `id`
  - `string`
  - Optional, but required if a `path` is not provided
  - The unique identifier for the route if it is to be configured as a layout route. If provided, the, the route will not match against the location pathname and its routes will be flattened into its parent route for matching.
- `validateSearch`
  - `(rawSearchParams: unknown) => TSearchSchema`
  - Optional
  - A function that will be called when this route is matched and passed the raw search params from the current location and return valid parsed search params. If this function throws, the route will be put into an error state and the error will be thrown during render. If this function does not throw, its return value will be used as the route's search params and the return type will be inferred into the rest of the router.
- `parseParams`
  - `(rawParams: Record<string, string>) => TParams`
  - Optional
  - A function that will be called when this route is matched and passed the raw params from the current location and return valid parsed params. If this function throws, the route will be put into an error state and the error will be thrown during render. If this function does not throw, its return value will be used as the route's params and the return type will be inferred into the rest of the router.
- `stringifyParams`
  - `(params: TParams) => Record<string, string>`
  - Required if `parseParams` is provided
  - A function that will be called when this routes parsed params are being used to build a location. This function should return a valid object of `Record<string, string>` mapping.
- `beforeLoad`
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
- `loader`
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
- `shouldReload`
  ```tsx
  type shouldReload =
    | boolean
    | ((
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
      ) => Promise<TDeps | boolean> | TDeps | boolean)
  ```
  - Optional, defaults to `true`
  - If `true`, the route will be reloaded every time it is matched, including locations where the route is already matched and stays matched in the next location.
  - If `false`, the route will not reload after it is initially matched and loaded.
  - If a function is provided that returns a `boolean`, the above rules will be applied based on the return value of the function.
  - If a function is provided that returns an **object or array** of dependencies, the route will be reloaded when any of the dependencies change. Changes are tracked using deep equality checks.
- `key`
  - `(opts: { search: TFullSearchSchema; location: ParsedLocation }) => any`
  - Optional
  - A function that will be called before this route is matched to provide additional unique identification to the route match. It should return any serializable value that can uniquely identify the route match from navigation to navigation.
  - If your route match relies on a search params for unique identification, it's recommended to use the `key` option to return a unique value based on the search params. This will ensure that the route match is not shared between locations that have different search params.
- `caseSensitive`
  - `boolean`
  - Optional
  - If `true`, this route will be matched as case-sensitive
- `wrapInSuspense`
  - `boolean`
  - Optional
  - If `true`, this route will be forcefully wrapped in a suspense boundary, regardless if a reason is found to do so from inspecting its provided components.
- `pendingMs`
  - `number`
  - Optional
  - Defaults to `routerOptions.defaultPendingMs`, which defaults to `1000`
  - The threshold in milliseconds that a route must be pending before its `pendingComponent` is shown.
- `pendingMinMs`
  - `number`
  - Optional
  - Defaults to `routerOptions.defaultPendingMinMs` which defaults to `500`
  - The minimum amount of time in milliseconds that the pending component will be shown for if it is shown. This is useful to prevent the pending component from flashing on the screen for a split second.
- `preSearchFilters`
  - `((search: TFullSearchSchema) => TFullSearchSchema)[]`
  - Optional
  - An array of functions that will be called when generating any new links to this route or its grandchildren.
  - Each function will be called with the current search params and should return a new search params object that will be used to generate the link.
  - It has a `pre` prefix because it is called before the user-provided function that is passed to `navigate`/`Link` etc has a chance to modify the search params.
- `postSearchFilters`
  - `((search: TFullSearchSchema) => TFullSearchSchema)[]`
  - Optional
  - An array of functions that will be called when generating any new links to this route or its grandchildren.
  - Each function will be called with the current search params and should return a new search params object that will be used to generate the link.
  - It has a `post` prefix because it is called after the user-provided function that is passed to `navigate`/`Link` etc has modified the search params.
- `onError`
  - `(error: unknown) => void`
  - Optional
  - A function that will be called when an error is thrown during a navigation or preload event.
  - If this function returns a `redirect` object, the redirect will be applied immediately.
- `onEnter`
  - `(match: RouteMatch) => void`
  - Optional
  - A function that will be called when a route is matched and loaded after not being matched in the previous location.
- `onStay`
  - `(match: RouteMatch) => void`
  - Optional
  - A function that will be called when a route is matched and loaded after being matched in the previous location.
- `onLeave`
  - `(match: RouteMatch) => void`
  - Optional
  - A function that will be called when a route is no longer matched after being matched in the previous location.
- `component`
  - `RouteComponent` or `LazyRouteComponent`
  - Optional - Defaults to `<Outlet />`
  - The content to be rendered when the route is matched.
- `errorComponent`
  - `RouteComponent` or `LazyRouteComponent`
  - Optional - Defaults to `routerOptions.defaultErrorComponent`
  - The content to be rendered when the route encounters an error.
- `pendingComponent`
  - `RouteComponent` or `LazyRouteComponent`
  - Optional - Defaults to `routerOptions.defaultPendingComponent`
  - The content to be rendered if and when the route is pending and has reached its pendingMs threshold.

# `Route` class

The `Route` class implements the `RouteApi` class and can be used to create route instances. A route instance can then be used to create a route tree.

### `Route` constructor

- `options`
  - `RouteOptions`
  - Required
  - The options that will be used to configure the route instance

### `Route` methods

- `addChildren`
  - `(children: Route[]) => this`
  - Adds child routes to the route instance and returns the route instance (but with updated types to reflect the new children)
- `update`
  - `(options: Partial<UpdatableRouteOptions>) => this`
  - Updates the route instance with new options and returns the route instance (but with updated types to reflect the new options)
  - In some circumstances, it can be useful to update a route instance's options after it has been created to avoid circular type references.
- ...`RouteApi` methods
  - All of the methods from the `RouteApi` class are available on the `Route` class

# `RouteApi` class

The `RouteApi` class provides type-safe version of common hooks like `useParams`, `useLoaderData`, `useRouteContext`, and `useSearch` that are pre-bound to a specific route ID and corresponding registered route types.

### `RouteApi` constructor

- `opts.routeId`
  - `string`
  - Required
  - The route ID to which the `RouteApi` instance will be bound

### `RouteApi` methods

- `useMatch`
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
- `useRouteContext`
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
- `useSearch`
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
- `useParams`
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
- `useLoaderData`
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

- `options`
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

- `addChildren`
  - `(children: Route[]) => this`
  - Adds child routes to the root route instance and returns the root route instance (but with updated types to reflect the new children)
- `update`
  - `(options: Partial<UpdatableRouteOptions>) => this`
  - Updates the root route instance with new options and returns the root route instance (but with updated types to reflect the new options)
  - In some circumstances, it can be useful to update a root route instance's options after it has been created to avoid circular type references.

# `rootRouteWithContext` function

The `rootRouteWithContext` function is a helper function that can be used to create a root route instance that requires a context type to be fulfilled when the router is created.

### Generics

- `TRouterContext`
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

export function rootRouteWithContext<TRouterContext extends {}>() {
return <
TSearchSchema extends Record<string, any> = {},
TRouteContext extends RouteContext = RouteContext,
TLoaderData extends any = unknown,

> (

    options?: Omit<
      RouteOptions<
        AnyRoute, // TParentRoute
        RootRouteId, // TCustomId
        '', // TPath
        TSearchSchema, // TSearchSchema
        TSearchSchema, // TFullSearchSchema
        {}, // TParams
        {}, // TAllParams
        TRouteContext, // TRouteContext
        Assign<TRouterContext, TRouteContext>, // TAllContext
        TLoaderData // TLoaderData
      >,
      | 'path'
      | 'id'
      | 'getParentRoute'
      | 'caseSensitive'
      | 'parseParams'
      | 'stringifyParams'
    >,

): RootRoute<TSearchSchema, TRouteContext, TRouterContext> => {
return new RootRoute(options) as any
}
}

export class RootRoute<
TSearchSchema extends Record<string, any> = {},
TRouteContext extends RouteContext = RouteContext,
TRouterContext extends {} = {},
TLoaderData extends any = unknown,

> extends Route<
> any, // TParentRoute
> '/', // TPath
> '/', // TFullPath
> string, // TCustomId
> RootRouteId, // TId
> TSearchSchema, // TSearchSchema
> TSearchSchema, // TFullSearchSchema
> {}, // TParams
> {}, // TAllParams
> TRouteContext, // TRouteContext
> Expand<Assign<TRouterContext, TRouteContext>>, // TAllContext
> TRouterContext, // TRouterContext
> TLoaderData,
> any, // TChildren
> any // TRouteTree
> {
> constructor(

    options?: Omit<
      RouteOptions<
        AnyRoute, // TParentRoute
        RootRouteId, // TCustomId
        '', // TPath
        TSearchSchema, // TSearchSchema
        TSearchSchema, // TFullSearchSchema
        {}, // TParams
        {}, // TAllParams
        TRouteContext, // TRouteContext
        Assign<TRouterContext, TRouteContext>, // TAllContext
        TLoaderData
      >,
      | 'path'
      | 'id'
      | 'getParentRoute'
      | 'caseSensitive'
      | 'parseParams'
      | 'stringifyParams'
    >,

) {
super(options as any)
}
}

---
