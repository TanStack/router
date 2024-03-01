---
id: createRouteFunction
title: createRoute function
---

The `createRoute` function implements returns a new [`Route`](./api/router/RouteClass) instance. A route instance can then be passed to a root route's children to create a route tree, which is then passed to the router.

## createRoute options

- Type: `RouteOptions`
- Required
- The options that will be used to configure the route instance

## createRoute returns

- A new [`Route`](./api/router/RouteClass) instance.

## Examples

```tsx
import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './__root';

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  loader: () => {
    return 'Hello World'
  },
  component: IndexComponent
})

function IndexComponent() {
  const data = Route.useLoaderData()
  return <div>{data}</div>
}
```