---
title: Preloading
---

Preloading in TanStack Router is a way to load a route before the user actually navigates to it. This is useful for routes that are likely to be visited by the user, but not necessarily on the first page load.

**Preloading works by using hover and touch start events on `<Link>` components to preload the dependencies for the destination route.**

The simplest way to preload routes for your application is to set the `preload` option to `intent` for your entire router:

```tsx
import { Router } from '@tanstack/router'

const router = new Router({
  // ...
  defaultPreload: 'intent',
})
```

This will turn on preloading by default for all `<Link>` components in your application. You can also set the `preload` prop on individual `<Link>` components to override the default behavior.

## Preload Delay

By default, preloading will start after **50ms** of the user hovering or touching a `<Link>` component. You can change this delay by setting the `preloadDelay` option on your router:

```tsx
import { Router } from '@tanstack/router'

const router = new Router({
  // ...
  defaultPreloadDelay: 100,
})
```

You can also set the `preloadDelay` prop on individual `<Link>` components to override the default behavior on a per-link basis.

## Preloading with Data Loaders

Preloading is most useful when combined with your favorite data loading library. To make this easier, the `loader` route option function receives a `preload` boolean denoting whether the route is being preloaded or not. This allows you to load data differently depending on whether the user is navigating to the route or preloading it.

Here's an example using TanStack Loaders:

```tsx
import { Route } from '@tanstack/router'

const postsRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'posts',
  component: PostsComponent,
  loader: async ({ preload }) => {
    postsLoader.load({ preload })
  },
})
```

Not all data loading libraries will differentiate between preloading or not, but usually a preload method or option is available and can control different aspects of the actual data fetching or caching strategy of the data. For example, when you pass `preload` to TanStack Loaders, the maxAge and maxGcAge are tracked separately from the normal load method.

## Preloading Manually

If you need to manually preload a route, you can use the router's `preloadRoute` method. It accepts a standard TanStack `NavigateOptions` object and returns a promise that resolves when the route is preloaded.

```tsx
function Component() {
  const router = useRouter()

  useEffect(() => {
    try {
      router.preloadRoute({ to: postRoute, params: { id: 1 } })
    } catch (err) {
      // Failed to preload route
    }
  }, [])

  return <div />
}
```
