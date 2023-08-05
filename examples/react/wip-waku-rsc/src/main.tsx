import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, Router, Route, RootRoute } from '@tanstack/router'

import rootComponent from './pages/root'
import indexComponent from './pages/index'
import aboutComponent from './pages/about'

export const rootRoute = new RootRoute().update({
  component: rootComponent,
})

export const indexRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (search) =>
    search as {
      param1: string
      param2: {
        nestedParam2: boolean
      }
    },
}).update({
  component: indexComponent,
})

export const aboutRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/about',
}).update({
  component: aboutComponent,
})

const routeTree = rootRoute.addChildren([indexRoute, aboutRoute])
const router = new Router({ routeTree })

declare module '@tanstack/router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('app')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(<RouterProvider router={router} />)
}
