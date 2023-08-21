---
title: Routes
---

Routes are the primary way of configuring TanStack Router and are created using the `RootRoute` and `Route` classes. Multiple routes can be nested within each other to create a route tree, which is then used to create a router.

## The Root Route

To start building your route hierarchy, you can call `new RootRoute()` to create a root route. `RootRoute` optionally accepts an options object similar to that of `new Route()`, but excludes any `path` related options, since the root route implicitly has no path.

```tsx
import { RootRoute } from '@tanstack/react-router'

const rootRoute = new RootRoute()
```

> 🧠 Another way to create a root route is via the `new RouteContext<Type>().createRootRoute()` method, which is a type-safe way of doing dependency injection for the entire router. Read more about this in the [Context Section](./router-context)

## Outlets

The `Outlet` component is used to render the next matching child (if there are more child routes that match). It doesn't take any props and can be rendered anywhere within a route's component that you'd like to render a child route match.

If a `component` isn't supplied to a route, it will render an `<Outlet />` automatically. Let's give our root route a component that renders a title, then an `<Outlet />` for child routes to render.

```tsx
import { RootRoute } from '@tanstack/react-router'

const rootRoute = new RootRoute({
  component: () => (
    <div>
      <h1>My App</h1>
      <Outlet /> {/* This is where child routes will render */}
    </div>
  ),
})
```

## Routes

Routes can be created by calling `new Route()`. In order to receive both type and runtime information from their parents, child routes must reference their parent route via the `getParentRoute` option. This may seem a little strange at first, but it ensures that your route definitions themselves are type-safe and free from the perils of circular imports and uninstantiated variables... long story short, it allows you to create your routes wherever you want, and whenever you want while still maintaining type-safety.

```ts
let rootRoute = new RootRoute()
const indexRoute = new Route({ getParentRoute: () => rootRoute, path: '/' })
const blogRoute = new Route({ getParentRoute: () => rootRoute, path: 'blog' })
const postRoute = new Route({ getParentRoute: () => blogRoute, path: '$slug' })
```

## Building a Route Tree

Once all of your child routes have been created, a final route tree can be assembled using the `routeConfig.addChildren([...])` utility. This utility accepts an array of route definitions, and returns a final type-safe route tree.

```ts
const routeTree = rootRoute.addChildren([
  indexRoute,
  blogRoute.addChildren([postRoute]),
])
```

> ❓ Why do you have to create a route tree if each route already knows it's parent?
> ✅ Each route may know everything about its parents, but we don't yet have a single source of truth that knows about every single route in our application. The route tree is that source of truth that powers the wholistic type-safety of TanStack Router.

## Creating a Router

Once you have a route tree, you can create a router using the framework `Router` class of your choice. For example, if you are using React, you would use call `new Router()`. The Router class takes a route tree as one of its many options, and returns a router instance.

```tsx
const router = new Router({ routeTree })
```

## Registering Router Types

TanStack Router provides amazing support for TypeScript, even for things you wouldn't expect like bare imports straight from the library! To make this possible, you must register your router's types using TypeScripts' [Declaration Merging](https://www.typescriptlang.org/docs/handbook/declaration-merging.html) feature. This is done by extending the `Register` interface on your framework's router module. For example, if you are using React, you would extend the `Register` interface on `@tanstack/react-router` with a `router` property that has the type of your `router` instance:

```tsx
declare module '@tanstack/react-router' {
  interface Register {
    // This infers the type of our router and registers it across your entire project
    router: typeof router
  }
}
```

With your router type registered, you'll now get type-safety across your entire project for anything related to routing.

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

Now that you learned how to build a router, let's dig into more of the Route options in the next section!
