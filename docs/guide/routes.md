---
title: Routes
---

Routes are the primary way of configuring TanStack Router and are created using the `RootRoute` and `Route` classes. Multiple routes can be nested within each other to create a route tree, which is then used to create a router.

> 🧠 Even though TanStack Router provides a file-based routing solution via TanStack Router CLI, it's still important to learn how to create routes manually, as it's the foundation of how the CLI works under the hood.

## The Root Route

To start building your route hierarchy, call `new RootRoute()` to create a root route. The `RootRoute` class optionally accepts an options object. The root Route is the only route that doesn't require a `path` or `id` option.

```tsx
import { RootRoute } from '@tanstack/react-router'

const rootRoute = new RootRoute()
```

> 🧠 You can also create a root route via the `rootRouteWithContext<TContext>()` function, which is a type-safe way of doing dependency injection for the entire router. Read more about this in the [Context Section](./guide/router-context)

## Outlets

The `Outlet` component is used to potentially render any matching child routes (if they match the current URL). `<Outlet />` doesn't take any props and can be rendered anywhere within a route's component where you'd like to potentially render the next child route match.

Let's give our root route a component that renders a title, then an `<Outlet />` for our top-level routes to render.

```tsx
import { RootRoute } from '@tanstack/react-router'

const rootRoute = new RootRoute({
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

## Routes

Routes can be created by calling `new Route()`. In order to receive both type and runtime information from their parents, child routes must reference their parent route via the `getParentRoute` option. This may seem a little strange at first, but it ensures that your route definitions themselves are type-safe and free from the perils of circular imports and uninstantiated variables... long story short, it allows you to create your routes wherever you want, and whenever you want while still maintaining type-safety.

```ts
let rootRoute = new RootRoute()
const indexRoute = new Route({ getParentRoute: () => rootRoute, path: '/' })
const blogRoute = new Route({ getParentRoute: () => rootRoute, path: 'blog' })
const postRoute = new Route({ getParentRoute: () => blogRoute, path: '$slug' })
```

## Building a Route Tree

Once all of your routes have been created, assemble a route tree using the `rootRoute.addChildren([...])` and `route.addChildren([...])` utilities. The `addChildren` method accepts an array of child route definitions, and returns a final type-safe route tree.

```ts
const routeTree = rootRoute.addChildren([
  indexRoute,
  blogRoute.addChildren([postRoute]),
])
```

> ❓ Why do you have to create a route tree if each route already knows it's parent?
> ✅ Each route may know everything about its parent, but we don't yet have a single source of truth that knows about every single route in our application. The route tree is that source of truth that powers the wholistic type-safety of TanStack Router.

## Creating a Router

Once you have a route tree, create a router using the `Router` class, which takes a route tree as one of its many options, and returns a router instance.

```tsx
const router = new Router({ routeTree })
```

## Registering Router Types

TanStack Router provides amazing support for TypeScript, even for things you wouldn't expect like bare imports straight from the library! To make this possible, you must register your router's types using TypeScripts' [Declaration Merging](https://www.typescriptlang.org/docs/handbook/declaration-merging.html) feature. This is done by extending the `Register` interface on `@tanstack/react-router` with a `router` property that has the type of your `router` instance:

```tsx
declare module '@tanstack/react-router' {
  interface Register {
    // This infers the type of our router and registers it across your entire project
    router: typeof router
  }
}
```

With your router registered, you'll now get type-safety across your entire project for anything related to routing.

## All together now!

```ts
import { RootRoute, Route, Router } from '@tanstack/react-router'

let rootRoute = new RootRoute()
const indexRoute = new Route({ getParentRoute: () => rootRoute, path: '/' })
const blogRoute = new Route({ getParentRoute: () => rootRoute, path: 'blog' })
const postRoute = new Route({ getParentRoute: () => blogRoute, path: '$slug' })

const routeTree = rootRoute.addChildren([
  indexRoute,
  blogRoute.addChildren([postRoute]),
])

const router = new Router({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```

Now that you know how to build a router, let's dig into more of the Route options in the next section!
