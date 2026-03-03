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

## Deep Linking

Configure deep linking on `router` `native` options. `NativeRouterProvider`
will wire React Native's `Linking` API automatically.

```tsx
import {
  createRouter,
  createNativeHistory,
} from '@tanstack/react-native-router'

const router = createRouter({
  routeTree,
  history: createNativeHistory(),
  native: {
    linking: {
      prefixes: ['myapp://', 'https://myapp.com'],
    },
  },
})
```

Default behavior:

- `getInitialURL()` is applied once on mount with `push`
- initial deep-link `push` does not animate by default
- runtime URL events are applied with `push`
- URLs are parsed into router hrefs (`/path?query#hash`)

Supported linking options:

- `enabled`: enable/disable built-in linking (default `true`)
- `prefixes`: app URL prefixes to match before parsing
- `filter(url)`: ignore specific URLs
- `parseUrl(url)`: custom URL -> router href mapping
- `getInitialURL()`: override initial URL source
- `subscribe(listener)`: override runtime URL subscription source
- `initialMode`: `'replace' | 'push'` for initial URL
- `initialAnimate`: whether initial deep-link push animates (default `false`)
- `incomingMode`: `'replace' | 'push'` for runtime URLs
- `onUnhandledUrl(url)`: callback for ignored/unmatched URLs
- `onError(error, url?)`: callback for parse/navigation errors

Disable built-in linking:

```tsx
const router = createRouter({
  routeTree,
  history: createNativeHistory(),
  native: {
    linking: false,
  },
})
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
    minStackState: 'paused',
  },
})
```

`native` also supports a function form (similar to `head`) so options can be
derived from dynamic match data, including `loaderData`:

```tsx
createRoute({
  path: 'posts/$postId',
  loader: ({ params }) => fetchPost(params.postId),
  native: ({ loaderData, params }) => ({
    title:
      (loaderData as { title?: string } | undefined)?.title ??
      `Post #${params.postId}`,
    headerTintColor: '#fff',
  }),
})
```

Supported fields:

- `presentation`: native screen presentation (`push`, `modal`, etc.)
- `gestureEnabled`: enables native back swipe gestures where supported
- `animation`: native stack animation
- `minStackState`: per-entry minimum (`paused` or `active`)
- `defaultMinStackState`: default minimum for this route and descendants

`native` options are inherited through matched route ancestors. Child routes
override parent values when both provide the same field.

## Native Header System

React Native uses a native-header-first model.

Configure headers directly from route `native` options:

```tsx
createRoute({
  path: 'posts/$postId',
  native: {
    title: ({ params }) => `Post #${params.postId}`,
    headerShown: true,
    headerTintColor: '#fff',
    headerStyle: { backgroundColor: '#6366f1' },
    headerRight: ({ tintColor }) => <MyAction tintColor={tintColor} />,
  },
})
```

Header options:

- `headerShown`: show/hide native header
- `title` / `headerTitle`: title text or custom title renderer
- `headerBackVisible`: control native back button visibility
- `headerLeft` / `headerRight`: custom header actions
- `headerTintColor`: tint color for title/buttons
- `headerStyle.backgroundColor`: header background color
- `headerTransparent`: translucent header mode
- `headerLargeTitle`: iOS large title mode

Defaults:

- routes with `presentation: 'none'` default to hidden header
- all other routes default to shown header
- providing `headerLeft` hides native back button unless `headerBackVisible: true`

### Custom Header Escape Hatch

Use `native.header` to render a fully custom in-screen header for a route:

```tsx
native: {
  header: ({ params, canGoBack }) => (
    <ScreenHeader title={`Depth ${params.depth}`} showBack={canGoBack} />
  ),
}
```

When `native.header` is used, native header chrome is hidden for that route.

## Stack Lifecycle Policy

React Native lifecycle state is resolved in two phases:

1. Depth fallback policy from router `native` config
2. Minimum-state clamp from route/navigation `native` config

Router fallback policy:

```tsx
createRouter({
  routeTree,
  history,
  native: {
    pausedDepth: 3,
    detachedDepth: 4,
    defaultMinStackState: 'paused',
  },
})
```

- top entry: `active`
- `depth >= detachedDepth`: `detached`
- other non-top entries: `paused`

Route-level minimums:

```tsx
createRoute({
  path: 'posts/$postId',
  native: {
    minStackState: 'paused',
    defaultMinStackState: 'paused',
  },
})
```

- `minStackState`: applies to this route entry only
- `defaultMinStackState`: applies to this route and descendants unless overridden

Navigation-level minimums can be set per entry and persist in history state:

```tsx
router.navigate({
  to: '/posts/$postId',
  params: { postId: '123' },
  native: { minStackState: 'active' },
})
```

Resolution precedence:

1. `navigate()` / `<Link>` `native.minStackState`
2. route `native.minStackState`
3. nearest route `native.defaultMinStackState`
4. router `native.defaultMinStackState`
5. router depth fallback

Like `head`, `native` function resolution is state-driven (match/location
updates), not per-render.

## Stack Reuse Behavior

React Native defaults to stack reuse behavior for `navigate()` and `<Link>`:

- reuse matching entry when found
- otherwise push a new entry

You can override per navigation:

```tsx
router.navigate({
  to: '/posts/$postId',
  params: { postId: '123' },
  stackBehavior: 'push', // 'auto' | 'push' | 'replace' | 'reuse'
})
```

When multiple matching entries exist, select which one to reuse:

```tsx
router.navigate({
  to: '/posts/$postId',
  params: { postId: '123' },
  stackBehavior: 'reuse',
  stackMatch: 'nearest', // 'nearest' | 'oldest'
})
```

Route-level identity can be configured with `native.getId`:

```tsx
createRoute({
  path: 'posts/$postId',
  native: {
    getId: ({ params }) => `post:${params.postId}`,
    stackMatch: 'nearest',
  },
})
```

## Notes

- Interactive swipe-to-go-back is supported through native stack behavior.
- Swipe-to-go-forward is not a native stack capability.
- In this repository's RN example, route tree wiring is currently manual (`src/routeTree.gen.ts`).
