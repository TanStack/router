---
title: Route Configs
---

Route configs (or route configurations) are the primary way of defining routing functionality for TanStack Router. They are built by chaining function calls to create new routes from the `createRouteConfig()` utility.

## Create a root route

To start building your route hierarchy, you can use the `createRouteConfig()` utility to create a root route. This utility optionally accepts a route options object, excluding the `path` option, since this is the root.

```ts
import { createRouteConfig } from '@tanstack/router'

const rootRoute = createRouteConfig()
```

## Creating Children Routes

Children routes can be created by calling the `.createRoute()` method on the root route or any other parent route. Child routes are not automatically added to the parent route, which allows them to be composed together all at once using the `routeConfig.addChildren([...])` utility. Let's create some child routes:

```ts
let rootRoute = createRouteConfig()

const indexRoute = rootRoute.createRoute({ path: '/' })
const blogRoute = rootRoute.createRoute({ path: 'blog' })
const postRoute = blogRoute.createRoute({ path: '$slug' })
```

## Building a Route Config

Once all of your child routes have been created, a final route config object can be assembled using the `routeConfig.addChildren([...])` utility. This utility accepts an array of route definitions, and returns a new route config object. This new route config object can be used to create a router, or can be used to create a new route config by adding more children.

```ts
let rootRoute = createRouteConfig()

const indexRoute = rootRoute.createRoute({ path: '/' })
const blogRoute = rootRoute.createRoute({ path: 'blog' })
const postRoute = blogRoute.createRoute({ path: '$slug' })

const routeConfig = rootRoute.addChildren([
  indexRoute,
  blogRoute.addChildren([postRoute]),
])
```
