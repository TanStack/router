---
title: Router
---

## Type Inference

To have type inference for your router, you need to merge the declarations of your router object and TanStack Router

```ts
// React example
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```

TODO
