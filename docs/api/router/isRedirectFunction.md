---
id: isRedirectFunction
title: `isRedirect` function
---


The `isRedirect` function can be used to determine if an object is a redirect object.

### Options

#### `obj`

- The object to check
- Required

### Returns

#### `true` if the object is a redirect object

#### `false` if the object is not a redirect object

### Examples

```tsx
import { isRedirect } from '@tanstack/react-router'

function somewhere(obj: unknown) {
  if (isRedirect(obj)) {
    // ...
  }
}
```
