---
id: RouterOptions
title: RouterOptions
---

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

#### `errorSerializer`

- Type: `RouterErrorSerializer`
- Optional
- The serializer object that will be used to determine how errors are serialized and deserialized between the server and the client.

# `RouterErrorSerializer` type

The `RouterErrorSerializer` type contains methods for serializing and deserializing errors.

### Properties

#### `serialize`
- Type: `(err: unknown) => TSerializedError`
- This method is called to define how errors are serialized when they are stored in the router's dehydrated state.

#### `deserialize`
- Type: `(err: TSerializedError) => unknown`
- This method is called to define how errors are deserialized from the router's dehydrated state.

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
