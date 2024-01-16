---
title: Outlets
---

Nested routing means that routes can be nested within other routes, including the way they render. So how do we tell our routes where to render this nested content?

## The `Outlet` Component

The `Outlet` component is used to render any potentially matching child routes. `<Outlet />` doesn't take any props and can be rendered anywhere within a route's component tree. If there are no matching child routes, `<Outlet />` will render `null`.

A great example is configuring the root route of your application. Let's give our root route a component that renders a title, then an `<Outlet />` for our top-level routes to render.

```tsx
import { RootRoute } from '@tanstack/react-router'

export const Route = new RootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <div>
      <h1>My App</h1>
      <Outlet /> {/* This is where child routes will render */}
    </div>
  )
}
```

> 🧠 If a route's `component` is left undefined, it will render an `<Outlet />` automatically.
