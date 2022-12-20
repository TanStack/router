---
id: useSearch
title: useSearch
---

```tsx
const search = useSearch({
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
- `select?: (search: TSearch) => TSelected`
  - **Optional**

**Returns**
- `search: TSelected | undefined`
