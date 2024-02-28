---
id: RedirectType
title: Redirect type
---

The `Redirect` type is used to represent a redirect action in TanStack Router.

```tsx
export type Redirect = {
  code?: number
  throw?: any
} & NavigateOptions
```

## Redirect `properties`

The `Redirect` object accepts/contains the following properties:

### `code` property

- Type: `number`
- Optional
- The HTTP status code to use when redirecting

### `throw` property

- Type: `any`
- Optional
- If provided, will throw the redirect object instead of returning it. This can be useful in places where `throwing` in a function might cause it to have a return type of `never`. In that case, you can use `redirect({ throw: true })` to throw the redirect object instead of returning it.

