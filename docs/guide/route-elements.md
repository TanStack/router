---
title: Route Elements
---

After we have defined our routes and set up data loaders for them, we can finally tell TanStack Router what to render when those routes are matched!

There are 3 types of route elements:

- `element`: A React element to render when the route is matched.
- `errorElement`: A React element to render when the route is matched but an error occurs.
- `pendingElement`: A React element to render when the route is matched and enters a `pending` state.

## What exactly is an element?

We refer to route elements with the same context as React. It is the result of a rendered block of JSX, a string, number, or even `null`. Here are a few examples:

```tsx
const routes = [
  { path: '/', element: <h1>Home</h1> },
  { path: '/about', element: 'about' },
  { path: '/contact', element: <Contact /> },
  { path: '/teams', element: <Teams customProp={'whatever'} /> },
  { path: '/optional', element: condition ? <Optional /> : null },
]
```

As long as you pass a valid JSX element, you can use it as a route element.

## The Default Elements

Routes come with a few defaults, each of which is customizable via the `Router` component.

- `element`: The `defaultElement` prop you pass to your `Router`, which defaults to `<Outlet>`.
  - If you don't specify an element, the `defaultElement` outlet will be used instead.
  - `<Outlet>` is the default element because it enables routes to be defined with just a path for hierarchical purposes, and simply act as a passthrough for rendering.
- `errorElement`: The `defaultErrorElement` prop you pass to your `Router`, which defaults to `null`.
  - In development, a default error element is provided to warn you of unhandled promises and the lack of an `errorElement` on the route
  - In production, there is no default error element, which means unhandled route errors will bubble up to the nearest `<ErrorBoundary>`
- `pendingElement`: The `defaultPendingElement` prop you pass to your `Router`, which defaults to `null`.

## Regular Route Elements

The regular `element` property of a route is what the router will render when a route is matched and ready to be displayed. There's not much to it!

```tsx
const routes = [{ path: '/', element: <Home /> }]
```

## Error Route Elements

The error `element` property of a route is what the router will render when a route loader or async element throws an error.

For more information, see the [Route Loaders - Handling Loader Errors](./route-loaders#handling-loader-errors) guide.

## Pending Route Elements

The pending `element` property of a route is what the router will render when a route loader enters the `pending` state.

Because a pending state shares some context with other sections, you can read all about it in its own [Pending States](./pending-states) guide.
