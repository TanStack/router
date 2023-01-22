---
id: useLoader
title: useLoader
---

```tsx
const data = useLoader({
  from,
  strict,
  select,
})
```

**Options**

- `from: TFrom`
  - **Required**
- `strict?: TStrict`
  - **Optional**
- `select?: (loaderData: TAllLoaderData) => TSelected`
  - **Optional**

**Returns**

- `data: TStrict extends true ? TSelected : TSelected | undefined`
