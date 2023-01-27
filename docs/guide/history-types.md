---
title: History Types
---

While it's not required to know the history API itself to use TanStack Router, it's a good idea to understand how it works. Under the hood, TanStack Router requires and uses a history instance to manage the routing history.

If you don't create a history instance, a browser history instance is created for you when the router is initialized.

If you need a special history instance type, You can use the history package to create your own history instance:

`createBrowserHistory`: The default history type.

`createHashHistory`: A history type that uses a hash to track history.

`createMemoryHistory`: A history type that keeps the history in memory.

Each of these APIs behaves slightly differently and documentation for them can be found in the [history](https://github.com/remix-run/history) package.

Once you have a history instance, you can pass it to the `ReactRouter` constructor:

```ts
import {
  createMemoryHistory,
  ReactRouter,
  createRouteConfig,
} from '@tanstack/react-router'

const rootRoute = createRouteConfig()

const indexRoute = new Route({ getParentRoute: () => rootRoute, path: '/' })

const memoryHistory = createMemoryHistory({
  initialEntries: ['/'], // Pass your initial url
})

const router = new ReactRouter({ routeConfig, history: memoryHistory })
```

## Browser Routing

The `createBrowserHistory` is the default history type. It uses the browser's history API to manage the browser history.

## Hash Routing

Hash routing can be helpful if your server doesn't support rewrites to index.html for HTTP requests (among other environments that don't have a server).

```ts
import {
  createHashHistory,
  ReactRouter,
  createRouteConfig,
} from '@tanstack/react-router'

const rootRoute = createRouteConfig()

const indexRoute = new Route({ getParentRoute: () => rootRoute, path: '/' })

const hashHistory = createHashHistory()

const router = new ReactRouter({ routeConfig, history: hashHistory })
```

## Memory Routing

Memory routing is useful in environments that are not a browser or when you do not want components to interact with the URL.

```ts
import {
  createMemoryHistory,
  ReactRouter,
  createRouteConfig,
} from '@tanstack/router'

const rootRoute = createRouteConfig()

const indexRoute = new Route({ getParentRoute: () => rootRoute, path: '/' })

const memoryHistory = createMemoryHistory({
  initialEntries: ['/'], // Pass your initial url
})

const router = new ReactRouter({ routeConfig, history: memoryHistory })
```
