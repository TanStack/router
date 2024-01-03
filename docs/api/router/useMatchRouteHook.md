---
id: useMatchRouteHook
title: useMatchRoute hook
---

The `useMatchRoute` hook is a hook that returns a `matchRoute` function that can be used to match a route against either the current or pending location.

### Returns

- A `matchRoute` function that can be used to match a route against either the current or pending location.

### `matchRoute` Options

#### `options`

- Type: `UseMatchRouteOptions`

### Returns

- The matched route's params or `false` if no route was matched

### Examples

```tsx
import { useMatchRoute } from '@tanstack/react-router'

// Current location: /posts/123
function Component() {
  const matchRoute = useMatchRoute()
  const params = matchRoute({ to: '/posts/$postId' })
  //    ^ { postId: '123' }
}

// Current location: /posts/123
function Component() {
  const matchRoute = useMatchRoute()
  const params = matchRoute({ to: '/posts' })
  //    ^ false
}

// Current location: /posts/123
function Component() {
  const matchRoute = useMatchRoute()
  const params = matchRoute({ to: '/posts', fuzzy: true })
  //    ^ {}
}

// Current location: /posts
// Pending location: /posts/123
function Component() {
  const matchRoute = useMatchRoute()
  const params = matchRoute({ to: '/posts/$postId', pending: true })
  //    ^ { postId: '123' }
}
```
