---
id: useMatch
title: useMatch
---

```tsx
const match = useMatch({
  from,
  strict
})
```

**Options**
- `from: TFrom`
  - **Required**
- `strict?: TStrict`
  - **Optional**

**Returns**
- `match: TStrict extends true ? TRouteMatch : TRouteMatch | undefined`
