---
id: MatchRouteOptionsType
title: MatchRouteOptions type
---

The `MatchRouteOptions` type is used to describe the options that can be used when matching a route.

### Properties

#### `pending`

- Type: `boolean`
- Optional
- If `true`, will match against pending location instead of the current location

#### `caseSensitive`

- Type: `boolean`
- Optional
- If `true`, will match against the current location with case sensitivity

#### `includeSearch`

- Type: `boolean`
- Optional
- If `true`, will match against the current location's search params using a deep inclusive check. e.g. `{ a: 1 }` will match for a current location of `{ a: 1, b: 2 }`

#### `fuzzy`

- Type: `boolean`
- Optional
- If `true`, will match against the current location using a fuzzy match. e.g. `/posts` will match for a current location of `/posts/123`

```tsx
interface MatchRouteOptions {
  pending?: boolean
  caseSensitive?: boolean
  includeSearch?: boolean
  fuzzy?: boolean
}
```
