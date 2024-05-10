---
id: useLocationHook
title: useLocation hook
---

The `useLocation` method is a hook that returns the current [`location`](../ParsedLocationType) object. This hook is useful for when you want to perform some side effect whenever the current location changes.

## useLocation returns

- The current [`location`](../ParsedLocationType) object.

## Examples

```tsx
import { useLocation } from '@tanstack/react-router'

function Component() {
  const location = useLocation()
  //    ^ ParsedLocation

  // ...
}
```
