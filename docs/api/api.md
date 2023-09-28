---
id: api
title: API Reference
---

# RouterContext

Use this class to create a new routing context. This context can be used to create a new root route, which will in turn require that you satisfy this context when creating a router that uses it.

```tsx
const routerContext =
  new RouterContext<// This context will be available router-wide
  ContextType>()
```

# RouterContext.createRootRoute

Use this method to create a new root route from a routing context. See [RootRoute](#rootroute) for more information.

```tsx
const routerContext = new RouterContext()
const rootRoute = routerContext.createRootRoute()
```

# RootRoute

Use this class to create a new root route. Only use this if you do not plan on supplying a routing context to your router. If you do need a routing context, create a new routing context and use the `RouterContext` class and its `createRootRoute` method instead.

The root route constructor takes a subset of options from the normal [Route](#route) class. The `path` and `id` options are not required for the root route. See [Route](#route) for more information.

```tsx
const rootRoute = new RootRoute({
  // ...
})
```

# Route

Use this class to create a new route.

```tsx
const myRoute = new Route({
  // REQUIRED - A function that returns the parent route.
  getParentRoute: () => Route | RootRoute,
  // REQUIRED (or an ID) - The path for the route.
  path: string,
  // REQUIRED (or a path) - The ID for the route, if it should not use a path to match its children.
  id: string,
  // A function to validate the search parameters for the route.
  validateSearch: (search: string) => boolean,
  // A function to provide any params or search params to the loader context
  loaderContext: (opts: {
    // The parsed path parameters available from this route and its parents.
    param: Record<string, string>
    // The parsed search parameters available from this route only.
    search: TFullSearchSchema
  }) =>
    // The loader context for this route only. The return value must be serializable.
    (TLoaderContext extends JSON.serializable),
  // An async function to load or prepare any required prerequisites for the route.
  loader: (match: {
    // The abortController used internally by the router
    abortController: AbortController
    // A boolean indicating whether or not the route is being preloaded.
    preload: boolean
    // The merged context for this route and its parents.
    context: TAllContext & TLoaderContext
    // If there is a parent route, this will be a promise that resolves when the parent route has been loaded.
    parentMatchPromise?: Promise<void>
  }) =>
    // The result of the loader function which wil be made available via this routes `useLoader` method.
    Promise<LoaderResult>,
  // A function to parse the path parameters for the route from the URL
  parseParams: (rawParams: Record<string, string>) => Record<string, TParams>,
  // A function to stringify the path parameters for the route back to the URL
  stringifyParams: (params: Record<string, TParams>) => Record<string, string>,
  //
  //
  // 🧠: The following options can be set in both the constructor AND via the Route.update method.
  //
  //
  // If true, this route will be matched as case-sensitive
  caseSensitive?: boolean,
  // If true, this route will be forcefully wrapped in a suspense boundary
  wrapInSuspense?: boolean,
  // The content to be rendered when the route is matched. If no component is provided, defaults to `<Outlet />`
  component?: (props: {
    // A function that returns the RouteMatch state for this route.
    useMatch: () => RouteMatch,
    // A function that return the loader return value for this route.
    useLoader: () => TLoader,
    // A function that returns the merged search parameters, including parent search parameters for this route.
    useSearch: (opts?: {
      // Defaults to `true`
      // If strict is set to `false`, will allow you to get this route's search parameters from a different route's rendering context
      strict?: TStrict
      // A function to select and subscribe to a subset of the search parameters for this route.
      select?: (search: TSearch) => TSelected
    }) => TStrict extends true ? TSelected : TSelected | undefined,
    // A function that returns the merged path parameters, including parent path parameters for this route.
    useParams: (opts?: {
      // A function to select and subscribe to a subset of the path parameters for this route.
      select?: (params: TDefaultSelected) => TSelected
    }) => TSelected,
    // A function that returns the merged context, including parent context for this route.
    useContext: (opts?: {
      // A function to select and subscribe to a subset of the context for this route.
      select?: (context: TDefaultSelected) => TSelected
    }) => TSelected
  }) => ReactNode,
  // The content to be rendered when the route encounters an error
  errorComponent?: (props: {
    // The error component receives the same props as the `component` option above
  }) => ReactNode,
  // If provided, the content to be rendered when the route is loading. If not provided, the route will suspend until ready to be rendered.
  errorComponent?: (props: {
    // The pending component receives the same props as the `component` option above
  }) => ReactNode,
  // An array of functions that can manipulate search params *before* they are passed to links and navigate calls that match this route.
  preSearchFilters?: ((search: TFullSearchSchema) => TFullSearchSchema)[]
  // An array of functions that can manipulate search params *after* they are passed to links and navigate
  // calls that match this route.
  postSearchFilters?: ((search: TFullSearchSchema) => TFullSearchSchema)[]
  // A function that will run before a route is loaded. If you throw a redirect from this function during a navigation, the location will be updated. If you throw any other error, the route will not be loaded (even preloaded)
  // If you choose to return an object, it will be assigned to this route's `routeContext` value and be merged onto the router's `context` value.
  beforeLoad?: (
    opts: {
      // The parsed path parameters available from this route and its parents.
      params: TAllParams
      // The parsed search parameters available from this route only.
      routeSearch: TSearchSchema
      // The marged and parsed search parameters available from this route and its parents.
      search: TFullSearchSchema
      // The abortController used internally by the router
      abortController: AbortController
      // A boolean indicating whether or not the route is being preloaded.
      preload: boolean
      // The context for this route only.
      routeContext: TContext
      // The merged context for thi,bs route and its parents.
      context: TAllContext
    // TContext extends Record<string, any>
    Promise<TContext> | TContext
  // If an error is encountered in any of the lifecycle methods, this function will be called with the error.
  onError?: (err: any) => void
  // These functions are called as route matches are loaded, stick around and leave the active
  // matches
  onEnter?: (match: AnyRouteMatch) => void
  onTransition?: (match: AnyRouteMatch) => void
  onLeave?: (match: AnyRouteMatch) => void
})
```

# Route.addChildren

The `addChildren` method is used to add child routes to the current route.

### Options

- children
  - `array`
  - **Required**
  - An array of child routes.

### Returns

- `Route`
- Returns the current route instance.

### Example

```tsx
const myRoute = new Route({
  path: '/home',
  id: 'homeId',
  component: HomeComponent,
})
myRoute.addChildren([childRoute1, childRoute2])
```

# Route.update

The `update` method updates the options of the route.

### Options

- options
  - `object`
  - **Required**
  - The options to be updated.

### Returns

- `Route`
- Returns the current route instance.

### Example

```tsx
const myRoute = new Route({
  path: '/home',
  id: 'homeId',
  component: HomeComponent,
})
myRoute.update({ component: UpdatedHomeComponent })
```

# Route.useMatch

The `useMatch` method returns the match for the given route.

### Options

- opts
  - `object`
  - Optional
  - Options for matching.

### Returns

- `MatchResult`
- Returns the match result.

### Example

```tsx
const myRoute = new Route({
  path: '/home',
  id: 'homeId',
  component: HomeComponent,
})
const match = myRoute.useMatch({ strict: true })
```

# Route.useLoader

The `useLoader` method returns the loader for the given route.

### Options

- opts
  - `object`
  - Optional
  - Options for retrieving the loader.

### Returns

- `LoaderResult`
- Returns the loader result.

### Example

```tsx
const myRoute = new Route({
  path: '/home',
  id: 'homeId',
  component: HomeComponent,
})
const loader = myRoute.useLoader({ strict: true })
```

# Route.useContext

The `useContext` method returns the context for the given route.

### Options

- opts
  - `object`
  - Optional
  - Options for retrieving the context.

### Returns

- `ContextResult`
- Returns the context result.

### Example

```tsx
const myRoute = new Route({
  path: '/home',
  id: 'homeId',
  component: HomeComponent,
})
const context = myRoute.useContext({ strict: true })
```

# Route.useSearch

The `useSearch` method returns the search parameters for the given route.

### Options

- opts
  - `object`
  - Optional
  - Options for retrieving the search parameters.

### Returns

- `SearchResult`
- Returns the search result.

### Example

```tsx
const myRoute = new Route({
  path: '/home',
  id: 'homeId',
  component: HomeComponent,
})
const search = myRoute.useSearch({ strict: true })
```

# Route.useParams

The `useParams` method returns the parameters for the given route.

### Options

- opts
  - `object`
  - Optional
  - Options for retrieving the parameters.

### Returns

- `ParamsResult`
- Returns the parameters result.

### Example

```tsx
const myRoute = new Route({
  path: '/home',
  id: 'homeId',
  component: HomeComponent,
})
const params = myRoute.useParams({ strict: true })
```

# lazyRouteComponent

```tsx
import { lazyRouteComponent } from '@tanstack/react-router'

export const expensiveRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'expensive',
  component: lazyRouteComponent(() => import('./Expensive')),
})

export const expensiveNamedRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'expensive',
  component: lazyRouteComponent(() => import('./Expensive'), 'Expensive'),
})
```

**Options**

- `importer: () => Promise<T>`
  - **Required**
- `namedImport: key of T = "default"`

**Returns**

- `element: RouteComponent`
