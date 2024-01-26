---
id: createRouteMaskFunction
title: createRouteMask function
---

The `createRouteMask` function is a helper function that can be used to create a route mask configuration that can be passed to the `routerOptions.routeMasks` option.

### Options

#### `options`

- Type: `RouteMask`
- Required
- The options that will be used to configure the route mask

### Returns

- A `RouteMask` object that can be passed to the `routerOptions.routeMasks` option.

### Examples

```tsx
import { createRouteMask, createRouter } from '@tanstack/react-router'

const photoModalToPhotoMask = createRouteMask({
  routeTree,
  from: '/photos/$photoId/modal',
  to: '/photos/$photoId',
  params: true,
})

// Set up a Router instance
const router = createRouter({
  routeTree,
  routeMasks: [photoModalToPhotoMask],
})
```
