---
id: Router
title: Router
---

## ⚠️ Deprecated

The `Router` class has been deprecated in favor of the `createRouter` function.

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
    - If `false`, the scroll position will not be reset to 0,0 after the location is committed to history.
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
