---
id: RedirectType
title: redirect type
---

The `redirect` type represents a redirect action in TanStack Router.

### Properties

#### `code`

- Type: `number`
- Optional
- The HTTP status code to use when redirecting

#### `throw`

- Type: `any`
- Optional
- If provided, will throw the redirect object instead of returning it. This can be useful in places where `throwing` in a function might cause it to have a return type of `never`. In that case, you can use `redirect({ throw: true })` to throw the redirect object instead of returning it.

```tsx
export type Redirect = {
  code?: number
  throw?: any
} & NavigateOptions
```
