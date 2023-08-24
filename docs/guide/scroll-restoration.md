---
id: scroll-restoration
title: Scroll Restoration
---

Scroll restoration is the process of restoring the scroll position of a page when the user navigates back to it. This is normally a built-in feature for standard HTML based websites, but can be difficult to replicate for SPA applications because:

- SPAs typically use the `history.pushState` API for navigation, so the browser doesn't know to restore the scroll position natively
- SPAs sometimes render content asynchronously, so the browser doesn't know the height of the page until after it's rendered
- SPAs can sometimes use nested scrollable containers to force specific layouts and features.

Not only that, but it's very common for applications to have multiple scrollable areas within an app, not just the body. For example, a chat application might have a scrollable sidebar and a scrollable chat area. In this case, you would want to restore the scroll position of both areas independently.

To alleviate this problem, TanStack Router provides a scroll restoration component and hook that handle the process of monitoring, caching and restoring scroll positions for you.

It does this by:

- Monitoring the DOM for scroll events
- Registering scrollable areas with the scroll restoration cache
- Listening to the proper router events to know when to cache and restore scroll positions
- Storing scroll positions for each scrollable area in the cache (including `window` and `body`)
- Restoring scroll positions after successful navigations before DOM paint

That may sound like a lot, but for you, it's as simple as this:

```tsx
import { ScrollRestoration } from '@tanstack/react-router'

function Root() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  )
}
```

Just render the `ScrollRestoration` component (or use the `useScrollRestoration` hook) at the root of your application and it will handle everything automaticaly!

## Custom Cache Keys

Falling in behind Remix's own Scroll Restoration APIs, you can also customize the key used to cache scroll positions for a given scrollable area using the `getKey` option. This could be used, for example, to force the same scroll position to be used regardless of the users browser history.

The `getKey` option receives the relevant `Location` state from TanStack Router and expects you to return a string to uniquely identify the scrollable measurements for that state.

The default `getKey` is `(location) => location.key`, where `key` is the unique key generated for each entry in the history.

## Examples

You could sync scrolling to the pathname:

```tsx
import { ScrollRestoration } from '@tanstack/react-router'

function Root() {
  return (
    <>
      <ScrollRestoration getKey={(location) => location.pathname} />
      <Outlet />
    </>
  )
}
```

You can conditionally sync only some paths, then use the key for the rest:

```tsx
import { ScrollRestoration } from '@tanstack/react-router'

function Root() {
  return (
    <>
      <ScrollRestoration
        getKey={(location) => {
          const paths = ['/', '/chat']
          return paths.includes(location.pathname)
            ? location.pathname
            : location.key
        }}
      />
      <Outlet />
    </>
  )
}
```

## Preventing Scroll Restoration

Currently there is no support for preventing the scroll restoration other than not rendering the `ScrollRestoration` component or not calling the `useScrollRestoration` hook.

If you encounter the need for this, please open an issue and we can pursue it further!
