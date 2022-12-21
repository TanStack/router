---
id: useLoaderData
title: useLoaderData
---

```tsx
const data = useLoaderData({
  from,
  strict,
  select
})
```

**Options**
- `from: TFrom`
  - **Required**
- `strict?: TStrict`
  - **Optional**
- `select?: (loaderData: TLoaderData) => TSelected`
  - **Optional**

**Returns**
- `data: TStrict extends true ? TSelected : TSelected | undefined`
