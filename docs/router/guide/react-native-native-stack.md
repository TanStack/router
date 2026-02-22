---
title: React Native Native Stack
---

This guide documents the React Native package and native stack behavior powered by `react-native-screens`.

## Package

Install `@tanstack/react-native-router` and provide a native history:

```tsx
import {
  createRouter,
  createNativeHistory,
} from '@tanstack/react-native-router/core'

export const router = createRouter({
  routeTree,
  history: createNativeHistory(),
})
```

Render with `NativeRouterProvider`:

```tsx
import { NativeRouterProvider } from '@tanstack/react-native-router'

;<NativeRouterProvider router={router} />
```

## Route `native` Options

Routes can define React Native presentation and lifecycle behavior under `native`:

```tsx
createRoute({
  path: 'posts/$postId',
  native: {
    presentation: 'push',
    gestureEnabled: true,
    animation: 'slide_from_right',
    stackState: 'paused',
  },
})
```

Supported fields:

- `presentation`: native screen presentation (`push`, `modal`, etc.)
- `gestureEnabled`: enables native back swipe gestures where supported
- `animation`: native stack animation
- `stackState`: stack lifecycle mode (`active`, `paused`, `detached`) or resolver function

## `stackState`

`stackState` controls how stack entries are kept/rendered:

- `active`: rendered, focused, effects running
- `paused`: rendered but hidden/paused via React `Activity`
- `detached`: not rendered, still represented in history

You can provide a function for depth-aware behavior:

```tsx
native: {
  stackState: ({ depth }) => {
    if (depth <= 2) return 'paused'
    return 'detached'
  },
}
```

Resolution happens on navigation changes (push/pop/replace), not on every render.

Default policy when not overridden:

- top entry: `active`
- previous entry: `paused`
- deeper entries: `detached`

## Notes

- Interactive swipe-to-go-back is supported through native stack behavior.
- Swipe-to-go-forward is not a native stack capability.
- In this repository's RN example, route tree wiring is currently manual (`src/routeTree.gen.ts`).
