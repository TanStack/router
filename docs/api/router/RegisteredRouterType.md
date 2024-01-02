---
id: RegisteredRouter
title: RegisteredRouter
---

# `RegisteredRouter` type

This type is used to get the type of a registered router instance, if one has been registered.

### Example

```tsx
import { RegisteredRouter } from '@tanstack/react-router'

type Router = RegisteredRouter
// This will be the type of the router instance that was registered via declaration merging or AnyRouter if no router instance has been registered.
```
