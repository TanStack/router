---
id: redirectFunction
title: `redirect` function
---


The `redirect` function returns a new `Redirect` object that can be either returned or thrown from places like a route's `loader` or `beforeLoad` methods to redirect to a new location.

### Options

#### `redirect`

- The `Redirect` options to create the redirect object
- Required

### Returns

- If `redirect.throw` is `true`, the `Redirect` object will be thrown instead of returned.
- Otherwise, the `Redirect` object will be returned.

### Examples

```tsx
import { redirect } from '@tanstack/react-router'

const route = new Route({
  // Returning a redirect object
  loader: () => {
    if (!user) {
      return redirect({
        to: '/login',
      })
    }
  },
  // or throwing a redirect object
  loader: () => {
    if (!user) {
      throw redirect({
        to: '/login',
      })
    }
  },
  // or forcing `redirect` to throw itself
  loader: () => {
    if (!user) {
      redirect({
        to: '/login',
        throw: true,
      })
    }
  },
})
```
