---
id: redirectFunction
title: redirect function
---

The `redirect` function returns a new `Redirect` object that can be either returned or thrown from places like a Route's `beforeLoad` or `loader` callbacks to trigger _redirect_ to a new location.

## redirect options

The `redirect` function accepts a single argument, the `options` to determine the redirect behavior.

- Type: [`Redirect`](./api/router/RedirectType)
- Required

## redirect returns

- If the `throw` property is `true` in the `options` object, the `Redirect` object will be thrown from within the function call.
- If the `throw` property is `false | undefined` in the `options` object, the `Redirect` object will be returned.

## Examples

```tsx
import { redirect } from '@tanstack/react-router'

const route = createRoute({
  // throwing a redirect object
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
  // ... other route options
})
```
