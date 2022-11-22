---
title: Route Configs
---

Route configs (or route configurations) are the primary way of defining routing functionality for TanStack Router. They built by chaining function calls from the `createRouteConfig()` utility.

## Create a root config

To build a new route configuration, you can use the `createRouteConfig()` utility. This utility accepts a single argument, which is the route config's parent config. If you are creating a root config, you can pass `undefined` as the argument.

```ts
import { createRouteConfig } from '@tanstack/react-router'

const routeConfig = createRouteConfig()
```

## Creating Auto-Added Children Routes

To create children routes and have them automatically added to the parent route, you can use the `routeConfig.createChildren(createRoute => {})` utility. This utility accepts a single argument, a function, which provides you a new `createRoute` function as an argument and expects you to return an array of new child routes. Let's just show you how it works and you'll get the hang of it:

```ts
const routeConfig = createRouteConfig().createChildren((createRoute) => [
  createRoute({ path: '/' }),
  createRoute({ path: '/about' }),
  createRoute({ path: '/contact' })
])
```

> 🧠 Auto-added routes are common if you are building very simple routing configuration all in a single file. If you are building a more complex routing configuration that spans multiple files and/or code-split points, you may want to consider using the `routeConfig.createRoute()` and `routeConfig.addChildren()` utilities instead.

### Creating Auto-Added Grand-Children Routes

The `routeConfig.createChildren(...)` utility can continue to be used on child routes to create an unlimited number of nesting levels. Let's create a child route and then create a grand-child route for that child route:

```ts
const routeConfig = createRouteConfig().createChildren((createRoute) => [
  createRoute({ path: '/' }),
  createRoute({ path: '/about' }),
  createRoute({ path: '/contact' }),
  createRoute({ path: '/blog' }).createChildren((createRoute) => [
    createRoute({ path: '/' }),
    createRoute({ path: '/:slug' }),
  ])
])
```

## Creating Unattached Children Routes

Unattached children routes are routes that are not automatically added to the parent route. Instead, they are added to the parent route later using the `routeConfig.addChildren(...)` utility. This utility accepts an array of routes to add to the parent route. Let's create some unattached child routes, then add ithem to the parent route:

```ts
let routeConfig = createRouteConfig()

const indexRouteDef = routeConfig.createRoute({ path: '/' })
const blogRouteDef = routeConfig.createRoute({ path: 'blog' })
const blogPostRouteDef = blogRouteDef.createRoute({ path: ':slug' })

routeConfig = routeConfig.addChildren([
  indexRouteDef,
  unattachedChildRoute.addChildren([unattachedGrandChildRoute]),
])
```

> 🧠 Unattached children routes are common if you are building a more complex routing configuration that spans multiple files and/or code-split points. If you are building a very simple routing configuration all in a single file, you may want to consider using the `routeConfig.createChildren()` utility instead.
