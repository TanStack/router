---
id: createRouterFunction
title: createRouter function
---

The `createRouter` function accepts a [`RouterOptions`](./api/router/RouterOptionsType) object and creates a new [`Router`](./api/router/RouterClass) instance.

## createRouter options

- Type: [`RouterOptions`](./api/router/RouterOptionsType)
- Required
- The options that will be used to configure the router instance.

## createRouter returns

- A new instance of the [`Router`](./api/router/RouterClass) class.

## Examples

```tsx
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

const router = createRouter({
  routeTree,
  defaultPreload: 'intent'
})

export default function App() {
  return <RouterProvider router={router} />
}
```