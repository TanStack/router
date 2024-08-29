---
id: RouterOptions
title: RouterOptions
---

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

### `defaultPreload` property

- Type: `undefined | false | 'intent' | 'viewport'`
- Optional
- Defaults to `false`
- If `false`, routes will not be preloaded by default in any way.
- If `'intent'`, routes will be preloaded by default when the user hovers over a link or a `touchstart` event is detected on a `<Link>`.
- If `'viewport'`, routes will be preloaded by default when they are within the viewport of the browser.

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

- Type: `boolean`
- Optional
- If `true`, route navigations will called using `document.startViewTransition()`.
- If the browser does not support this api, this option will be ignored.
- See [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition) for more information on how this function works.

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
- Optional or required if the root route was created with [`createRootRouteWithContext()`](./createRootRouteWithContextFunction.md).
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
- This property controls how TanStack Router will handle scenarios where it cannot find a route to match the current location. See the [Not Found Errors guide](../../guide/not-found-errors.md) for more information.

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

### `transformer` property

- Type: `RouterTransformer`
- Optional
- The transformer that will be used when sending data between the server and the client during SSR.
- Defaults to a very lightweight transformer that supports a few basic types. See the [SSR guide](../../guide/ssr.md) for more information.

#### `transformer.stringify` method

- Type: `(obj: unknown) => string`
- This method is called when stringifying data to be sent to the client.

#### `transformer.parse` method

- Type: `(str: string) => unknown`
- This method is called when parsing the string encoded by the server.

### `trailingSlash` property

- Type: `'always' | 'never' | 'preserve'`
- Optional
- Defaults to `never`
- Configures how trailing slashes are treated. `'always'` will add a trailing slash if not present, `'never'` will remove the trailing slash if present and `'preserve'` will not modify the trailing slash.
