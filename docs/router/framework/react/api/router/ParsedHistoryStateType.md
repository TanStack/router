---
id: ParsedHistoryStateType
title: ParsedHistoryState type
---

The `ParsedHistoryState` type represents a parsed state object. Additionally to `HistoryState`, it contains the index and the unique key of the route.

```tsx
export type ParsedHistoryState = HistoryState & {
  key?: string
  __TSR_index: number
}
```
