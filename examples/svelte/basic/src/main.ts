import './app.css'
import {
  RouterProvider,
  Router,
  Route,
  RootRoute,
} from '@tanstack/svelte-router'
import Root from './Root.svelte'
import Index from './routes/Index.svelte'
import About from './routes/About.svelte'

// Register your router for maximum type safety
declare module '@tanstack/svelte-router' {
  interface Register {
    router: typeof router
  }
}

// Create a root route
const rootRoute = new RootRoute({
  component: Root,
})

// Create an index route
const indexRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Index,
})

const aboutRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: About,
})

// Create the route tree using your routes
const routeTree = rootRoute.addChildren([indexRoute, aboutRoute])

// Create the router using your route tree
const router = new Router({ routeTree })

const app = new RouterProvider({
  target: document.getElementById('app'),
})

export default app
