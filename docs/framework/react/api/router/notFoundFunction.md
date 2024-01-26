---
id: notFoundFunction
title: notFound function
---

The `notFound` function returns a new `NotFoundError` object that can be either returned or thrown from places like a route's `loader` or `beforeLoad` methods to cause a route to render its `notFoundComponent`.

### Options

#### `notFoundError`

- The `NotFoundError` options to create the not-found error object
- Optional

### Returns

- If `notFoundError.throw` is `true`, the `NotFoundError` object will be thrown instead of returned.
- Otherwise, the `NotFoundError` object will be returned.

### Examples

```tsx
import { notFound } from '@tanstack/react-router'

const route = new Route({
  // throwing a not-found object
  loader: () => {
    if (!post) {
      throw notFound()
    }
  },
  // if you want to show a not-found on the whole page
  loader: () => {
    if (!team) {
      throw notFound({ global: true })
    }
  },
})
```
