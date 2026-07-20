---
id: usePendingMatchesHook
title: usePendingMatches hook
---

The `usePendingMatches` hook returns the [`RouteMatch`](./RouteMatchType.md) objects for the location the router is currently navigating to. While a navigation is loading, these are the matches for the destination location. Once the navigation resolves (or when no navigation is in flight), the array is empty and the resolved matches are available via [`useMatches`](./useMatchesHook.md).

This is useful for optimistic UI during navigation, e.g. highlighting the navigation item of the destination route from its `staticData` before its chunks and loaders have finished.

> [!TIP]
> If you want the currently rendered matches, use [`useMatches`](./useMatchesHook.md) instead.

## usePendingMatches options

The `usePendingMatches` hook accepts a single _optional_ argument, an `options` object.

### `opts.select` option

- Optional
- `(matches: RouteMatch[]) => TSelected`
- If supplied, this function will be called with the pending route matches and the return value will be returned from `usePendingMatches`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.

### `opts.structuralSharing` option

- Type: `boolean`
- Optional
- Configures whether structural sharing is enabled for the value returned by `select`.
- See the [Render Optimizations guide](../../guide/render-optimizations.md) for more information.

## usePendingMatches returns

- If a `select` function is provided, the return value of the `select` function.
- If no `select` function is provided, an array of [`RouteMatch`](./RouteMatchType.md) objects. The array is empty when no navigation is in flight.

## Examples

```tsx
import { useMatches, usePendingMatches } from '@tanstack/react-router'

function ActiveTab() {
  const pendingTab = usePendingMatches({
    select: (matches) => matches.findLast((m) => m.staticData.tab)?.staticData.tab,
  })
  const resolvedTab = useMatches({
    select: (matches) => matches.findLast((m) => m.staticData.tab)?.staticData.tab,
  })

  const activeTab = pendingTab ?? resolvedTab
  // ...
}
```
