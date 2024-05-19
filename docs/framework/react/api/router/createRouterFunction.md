---
id: createRouterFunction
title: createRouter function
---

The `createRouter` function accepts a [`RouterOptions`](../RouterOptionsType) object and creates a new [`Router`](../RouterClass) instance.

## createRouter options

- Type: [`RouterOptions`](../RouterOptionsType)
- Required
- The options that will be used to configure the router instance.

## createRouter returns

- An instance of the [`Router`](../RouterType).

## Examples

```tsx
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
})

export default function App() {
  return <RouterProvider router={router} />
}
```
