---
title: Quick Start
---

If you're feeling impatient and prefer to skip all of our wonderful documentation, here is the bare minimum to get going with TanStack Router. We'll use React for this example, but the same principles apply to other frameworks.

```tsx
import React, { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import {
  Outlet,
  RouterProvider,
  Link,
  ReactRouter,
  Route,
  RootRoute,
} from '@tanstack/react-router'

// Create a root route
const rootRoute = new RootRoute({
  component: Root,
})

function Root() {
  return (
    <>
      <div>
        <Link to="/">Home</Link> <Link to="/about">About</Link>
      </div>
      <hr />
      <Outlet />
    </>
  )
}

// Create an index route
const indexRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Index,
})

function Index() {
  return (
    <div>
      <h3>Welcome Home!</h3>
    </div>
  )
}

const aboutRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: About,
})

function About() {
  return <div>Hello from About!</div>
}

// Create the route tree using your routes
const routeTree = rootRoute.addChildren([indexRoute, aboutRoute])

// Create the router using your route tree
const router = new ReactRouter({ routeTree })

// Register your router for maximum type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Render our app!
const rootElement = document.getElementById('app')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
}
```

If you skipped this example or didn't understand something, we don't blame you, because there's so much more to learn to really take advantage of TanStack Router! Let's move on.
