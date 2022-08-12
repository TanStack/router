---
title: Pending States
---

Pending route states are similar to a React Suspense `fallback` state, or if you're not familiar with Suspense, a `loading` state.

## Why Pending States?

React Location is different from other routing libraries. Because it is asynchronous, it has its own "suspense"-like **pending state** when a new route is being loaded. If a route doesn't have any data requirements or async dependencies, it can be loaded immediately and the pending state isn't ever observed.

However, if a route has data requirements or async dependencies, it will be loaded in the background and the pending state can be observed in a few ways:

- Route pending elements triggered by a timeout
- Global pending navigation indicators
- Location-specific pending UI for the pending route

## Pending Element Timeouts

Routes can be configured to have a timeout before the route is considered pending. This timeout is essentially the amount of time we are willing to "suspend" and wait on the current route for the next one to load.

Configure a pending timeout in milliseconds with the `pendingMs` prop:

```tsx
const routes = [
  {
    path: '/',
    loader: () => loadHomeData()
    element: () => <div>Home</div>,
    pendingElement: async () => <div>Taking a long time...</div>,
    pendingMs: 1000 * 2, // 2 seconds
  },
]
```

- If all of a route's asynchronous behavior is completed before the timeout, the pending state will never be shown.
- If the timeout is reached, the route will be considered pending and the `pendingElement` will be shown until the route is fully loaded.

## Minimum Pending Element Timeouts

If and when a pending state is shown for a route, it is important to ensure that it doesn't "flicker" or "flash" when the route resolves too quickly after showing it. To fix this, you can specify a minimum amount of time to show the pending element before showing the normal one. This is done by configuring a minimum timeout in milliseconds with the `pendingMinMs` property:

```tsx
const routes = [
  {
    path: '/',
    loader: () => loadHomeData()
    element: () => <div>Home</div>,
    pendingElement: async () => <div>Taking a long time...</div>,
    pendingMs: 1000 * 2, // 2 seconds
    pendingMinMs: 500 // If it's shown, ensure the pending element is rendered for at least 500ms
  },
]
```

## Global Pending Navigation Indicators

When a route is pending, it might be useful to show a global indicator to the user. This can be done by subscribing to the `Router`'s `pending` state and rendering a global indicator when it is present.

Here is a _very contrived_ example of a global pending navigation indicator:

```tsx
function Root() {
  const router = useRouter<LocationGenerics>()

  return (
    <div>
      {!!router.pending ? <Spinner /> : null}
      <Outlet />
    </div>
  )
}
```

Here are some more tips to try!

- Try using CSS to hide/show your loader instead of rendering `null`
- Try using a CSS transition with different delays per-indicator-state to wait to show the loading indicator for a bit when loading, then immediately hiding it when complete.

## Location Specific Pending UI

When a transition is started to an asynchronous route, the current route will remain visible while it loads (unless a pending state is shown). While still visible, it is possible to show pending UI elements in the current route that are specific and conditional to the pending location. The two best tools to do this are the `useMatchRoute` hook and `MatchRoute` component.

Here's an example using the `MatchRoute` component with the `pending` prop to show a pending UI element when the link to that route matches:

```tsx
function App() {
  return (
    <Link to="dashboard">
      Dashboard{' '}
      <MatchRoute to="dashboard" pending>
        <Spinner />
      </MatchRoute>
    </Link>
  )
}
```

You can also use the `MatchRoute` component with a function as a child:

```tsx
function App() {
  return (
    <Link to="dashboard">
      Dashboard{' '}
      <MatchRoute to="dashboard" pending>
        {(match) => <Spinner show={!!match} />}
      </MatchRoute>
    </Link>
  )
}
```

Likewise, the `useMatchRoute` hook is an option if you would like a more functional approach:

```tsx
function App() {
  const matchRoute = useMatchRoute()

  return (
    <Link to="dashboard">
      Dashboard{' '}
      {matchRoute({ to: 'dashboard', pending: true }) ? <Spinner /> : null}
    </Link>
  )
}
```
