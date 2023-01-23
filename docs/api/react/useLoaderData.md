---
id: useLoaderInstance
title: useLoaderInstance
---

```tsx
const data = useLoaderInstance({
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
