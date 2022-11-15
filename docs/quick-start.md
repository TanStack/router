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
  createReactRouter,
  createRouteConfig,
} from '@tanstack/react-router'

const routeConfig = createRouteConfig().createChildren((createRoute) => [
  createRoute({
    path: '/',
    component: Index,
  }),
  createRoute({
    path: 'about',
    component: About,
  }),
])

const router = createReactRouter({ routeConfig })

function App() {
  return (
    <>
      <RouterProvider router={router}>
        <div>
          <router.Link to="/">Home</router.Link>{' '}
          <router.Link to="/about">About</router.Link>
        </div>
        <hr />
        <Outlet />
      </RouterProvider>
    </>
  )
}

function Index() {
  return (
    <div>
      <h3>Welcome Home!</h3>
    </div>
  )
}

function About() {
  return <div>Hello from About!</div>
}

const rootElement = document.getElementById('app')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
```

If you skipped that example, we don't blame you, because there's so much more to learn to really take advantage of TanStack Router! Let's move on.
