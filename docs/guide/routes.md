---
title: Routes
---

Routes are the primary way of configuring TanStack Router and are created using the `RootRoute` and `Route` classes. Multiple routes can be nested within each other to create a route tree, which is then used to create a router.

## The Root Route

To start building your route hierarchy, you can call `new RootRoute()` to create a root route. `RootRoute` optionally accepts an options object similar to that of `new Route()`, but excludes any `path` related options, since the root route implicitly has no path.

```tsx
import { RootRoute } from '@tanstack/router'

const rootRoute = new RootRoute()
```

## Outlets

The `Outlet` component is used to render the next matching child (if there are more child routes that match). It doesn't take any props and can be rendered anywhere within a route's component.

If a `component` isn't supplied to a route, it will render an `<Outlet />` automatically. Let's give our root route a component that renders a title, then an `<Outlet />` for child routes to render.

```tsx
import { RootRoute } from '@tanstack/router'

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

Regular routes (which are all technically "child" routes of the root route) can be created by calling `new Route()`. In order to receive both type and runtime information from their parents, child routes must reference their parent route via the `getParentRoute` option. This may seem a little strage at first, but it free's up the route creation API significantly from the perils of circular imports and uninstantiated variables... long story short, it allows you to create your routes wherever you want, and whenever you want while still maintaining type-safety.

```ts
let rootRoute = new RootRoute()
const indexRoute = new Route({ getParentRoute: () => rootRoute, path: '/' })
const blogRoute = new Route({ getParentRoute: () => rootRoute, path: 'blog' })
const postRoute = new Route({ getParentRoute: () => blogRoute, path: '$slug' })
```

## Building a Route Tree

Once all of your child routes have been created, a final route tree can be assembled using the `routeConfig.addChildren([...])` utility. This utility accepts an array of route definitions, and returns a final type-safe route tree.

```ts
const routeConfig = rootRoute.addChildren([
  indexRoute,
  blogRoute.addChildren([postRoute]),
])
```

## Creating a Router

Once you have a route tree, you can create a router using the framework `Router` class of your choice. For example, if you are using React, you would use call `new ReactRouter()`. Router classes take a route tree as one of their many options, and return a router instance.

```tsx
const router = new ReactRouter({ routeConfig })
```

## Registering Router Types

TanStack Router provides amazing support for TypeScript, even for things you wouldn't expect like relative navigation and even context-aware hooks! To make this possible, you must register your router type using TypeScripts' [Declaration Merging](https://www.typescriptlang.org/docs/handbook/declaration-merging.html) feature. This is done by extending the `Register` interface on your framework's router module. For example, if you are using React, you would extend the `Register` interface on `@tanstack/react-router` with a `router` property that has the type of your `router` instance:

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
import { RootRoute, Route, ReactRouter } from '@tanstack/react-router'
let rootRoute = new RootRoute()

const indexRoute = new Route({ getParentRoute: () => rootRoute, path: '/' })
const blogRoute = new Route({ getParentRoute: () => rootRoute, path: 'blog' })
const postRoute = new Route({ getParentRoute: () => blogRoute, path: '$slug' })

const routeConfig = rootRoute.addChildren([
  indexRoute,
  blogRoute.addChildren([postRoute]),
])

const router = new ReactRouter({ routeConfig })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```

Now that you learned how to build a router, let's dig in to more of the Route options in the next section!
