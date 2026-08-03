---
id: useIsBackNavigation
title: useIsBackNavigation hook
---

The `useIsBackNavigation` hook returns a boolean representing whether navigating to the given options would resolve to the **previous** history entry — i.e. whether clicking it should go "back" rather than push a new entry.

It is the primitive behind the [`preferBack`](../../guide/navigation.md#history-aware-links-preferback) prop on [`Link`](./linkComponent.md). Use it directly when building custom links or buttons that want the same history-aware behavior.

> ⚠️ The following `useIsBackNavigation` API is currently _experimental_.

## useIsBackNavigation options

The `useIsBackNavigation` hook accepts the same navigation options as `Link`/`useNavigate` (`to`, `params`, `search`, `hash`, `from`, etc.) as its first argument.

The optional second argument is the **match mode**:

- `'pathname'` (default) — match by pathname only, so going back restores the previous entry's exact search params and scroll position.
- `'exact'` — match by pathname **and** search.

## useIsBackNavigation returns

- `true` if the resolved target's pathname equals the previous history entry's pathname.
- `false` otherwise, including:
  - when the router is at history index `0` (nothing behind it),
  - when the previous entry is **unknown** to the router (e.g. a fresh page load or deep link, where the router never recorded the entry behind the current one),
  - on the server.

Because it returns `false` whenever a back navigation can't be determined, it is always safe to branch on: a `false` simply means "navigate normally".

## How it works

The browser only exposes the *current* history entry, so the router maintains an in-memory map of visited entries keyed by their history index (`__TSR_index`). `useIsBackNavigation` compares the resolved target against the entry at `currentIndex - 1`, by pathname (and search, in `'exact'` mode). You can read these entries directly via [`router.getHistoryEntry(index)`](./RouterType.md).

## Examples

```tsx
import { useRouter, useIsBackNavigation } from '@tanstack/react-router'

function BackToIssues() {
  const router = useRouter()
  const isBack = useIsBackNavigation({ to: '/issues' })

  return (
    <button
      onClick={() =>
        isBack ? router.history.back() : router.navigate({ to: '/issues' })
      }
    >
      Back to issues
    </button>
  )
}
```

For the common case, prefer the `preferBack` prop on `Link`, which renders a real `<a>` and wires this up for you:

```tsx
<Link to="/issues" preferBack>
  Back to issues
</Link>
```
