---
id: isNotFoundFunction
title: isNotFound function
---

The `isNotFound` function can be used to determine if an object is a `NotFoundError` object.

### Options

#### `obj`

- The object to check
- Required

### Returns

#### `true` if the object is a `NotFoundError`

#### `false` if the object is not a `NotFoundError`

### Examples

```tsx
import { isNotFound } from '@tanstack/react-router'

function somewhere(obj: unknown) {
  if (isNotFound(obj)) {
    // ...
  }
}
```
