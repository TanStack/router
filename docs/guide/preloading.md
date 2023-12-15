---
title: Preloading
---

Preloading in TanStack Router is a way to load a route before the user actually navigates to it. This is useful for routes that are likely to be visited by the user next. For example, if you have a list of posts and the user is likely to click on one of them, you can preload the post route so that it's ready to go when the user clicks on it.

## Supported Preloading Strategies

- Intent
  - **Preloading by "intent" works by using hover and touch start events on `<Link>` components to preload the dependencies for the destination route.**
- Render
  - **Coming soon!**
- Viewport Visiblity
  - **Coming soon!**

## How long does preloaded data stay in memory?

Preloaded route matches are temporarily cached in memory with a few important caveats:

- **Unused preloaded data is removed after 30 seconds by default.** This can be configured by setting the `defaultPreloadMaxAge` option on your router.
- **Obviously, when a a route is loaded, its preloaded version is promoted to the router's normal pending matches state.**

If you need more control over preloading, caching and/or garbage collection of preloaded data, you should use an external caching library like [TanStack Query](https://react-query.tanstack.com)

The simplest way to preload routes for your application is to set the `defaultPreload` option to `intent` for your entire router:

```tsx
import { Router } from '@tanstack/react-router'

const router = new Router({
  // ...
  defaultPreload: 'intent',
})
```

This will turn on `intent` preloading by default for all `<Link>` components in your application. You can also set the `preload` prop on individual `<Link>` components to override the default behavior.

## Preload Delay

By default, preloading will start after **50ms** of the user hovering or touching a `<Link>` component. You can change this delay by setting the `defaultPreloadDelay` option on your router:

```tsx
import { Router } from '@tanstack/react-router'

const router = new Router({
  // ...
  defaultPreloadDelay: 100,
})
```

You can also set the `preloadDelay` prop on individual `<Link>` components to override the default behavior on a per-link basis.

## Preloading supports Data Loaders and External Libraries

Preloading supports both built-in loaders and your favorite data loading libraries! To use the built-in loaders, simply return data from your route's loader function and optionally configure the `shouldReload` option to control when the route is preloaded.

If you'd rather use your favorite data loading library, you'll likely want to keep the aggressive default behavior of triggering preload logic every time the a `<Linkuser hovers or touches>` component, then allow your external library to control the actual data loading and caching strategy.

## Build-in Preloading & `shouldReload`

If you're using the built-in loaders, you can control when a route is preloaded by setting the `shouldReload` option on the route.

The `shouldReload` option on a route will be respected for preloading in the exact same way it is respected for normal route loading:

- If `shouldReload` is `true` (the default), the route will always be preloaded when the user triggers the preload. This might be a bit aggressive, but it's a thorough default to ensure that the route is always up-to-date.
- If `shouldReload` is `false`, the route will only be preloaded if the route is not already preloaded. This is useful for routes that are not likely to change often.
- If `shouldReload` is a function and returns `true`/`false`, the route will be preloaded based on the return value of the function.
- If `shouldReload` is a function and returns a dependency object/array, the route will be preloaded if the dependency object has changed since the last time the route was preloaded.

### Example

```tsx
import { Router } from '@tanstack/react-router'

const postRoute = new Route({
  path: '/posts/$id',
  loader: async ({ params }) => fetchPost(params.id),
  // Preload the route if the cache is older than 10 seconds
  shouldReload: ({ params }) => Math.floor(Date.now() / 10_000),
})

const router = new Router({
  // ...
  defaultPreload: 'intent',
})
```

## Preloading with External Libraries

It's common for external caching libraries to have their own tracking mechanisms for when data is stale. For example, [React Query](https://react-query.tanstack.com) has a `staleTime` option that controls how long data is considered fresh.

Since this is the norm, the default behavior of preloading in TanStack Router is to always trigger the preload logic when the user hovers or touches a `<Link>` component, then allow your external library to control the actual data loading and caching strategy.

Simply put **if you're using an external data loading library, you probably don't need to configure the `shouldReload` option**.

## Preloading Manually

If you need to manually preload a route, you can use the router's `preloadRoute` method. It accepts a standard TanStack `NavigateOptions` object and returns a promise that resolves when the route is preloaded.

```tsx
function Component() {
  const router = useRouter()

  useEffect(() => {
    try {
      const matches = await router.preloadRoute({
        to: postRoute,
        params: { id: 1 },
      })
    } catch (err) {
      // Failed to preload route
    }
  }, [])

  return <div />
}
```
