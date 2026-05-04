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

## File-Based Routing (Metro Plugin)

`@tanstack/router-plugin/metro` wraps your Metro config so the route tree
generates on startup and regenerates as you edit routes. Works for both
stock React Native and Expo (Expo Go and Expo Dev Client) — Expo's
bundler is Metro.

Install:

```bash
npm install --save-dev @tanstack/router-plugin @tanstack/router-cli
```

`@tanstack/router-cli` is required because the plugin shells out to it for
the initial blocking route generation when Metro starts.

### Expo

```js
// metro.config.js
const { getDefaultConfig } = require('expo/metro-config')
const { withTanStackRouter } = require('@tanstack/router-plugin/metro')

const config = getDefaultConfig(__dirname)
// ...any other Metro customizations...

module.exports = withTanStackRouter(config)
```

### Stock React Native

```js
// metro.config.js
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')
const { withTanStackRouter } = require('@tanstack/router-plugin/metro')

const defaultConfig = getDefaultConfig(__dirname)

module.exports = withTanStackRouter(
  mergeConfig(defaultConfig, {
    // any custom Metro config...
  }),
)
```

Add a `tsr.config.json` at the project root:

```json
{
  "target": "react-native",
  "routesDirectory": "./src/routes",
  "generatedRouteTree": "./src/routeTree.gen.ts"
}
```

That's it — `expo start` (or `npx react-native start`) now generates the
route tree before bundling and watches `routesDirectory` for changes.
You don't need to run `tanstack-router-cli watch` separately.

### Options

`withTanStackRouter` accepts a second argument:

```js
module.exports = withTanStackRouter(config, {
  // Override tsr.config.json values inline:
  config: { routesDirectory: './app/routes' },

  // Project root (defaults to process.cwd()):
  root: __dirname,

  // Skip the file watcher (defaults to dev only):
  watch: false,

  // Skip the blocking initial generate (defaults to true). Use this if
  // you generate routes out-of-band, e.g. as a CI step:
  initialGenerate: false,
})
```

### Behavior notes

- **Synchronous return.** The function returns the (unmodified) config
  object immediately. This matters for Expo's Metro CLI, which reads
  config fields synchronously before awaiting promises.
- **Initial generation is blocking.** The plugin spawns a subprocess of
  `@tanstack/router-cli generate` and waits for it. This typically adds
  ~300ms to the first metro config load.
- **Watch mode is async.** Started in the background in dev. Route file
  changes regenerate the tree; Metro's own watcher then triggers a fast
  refresh.

## Reference Examples

The matrix of supported runtime combinations lives at
[`examples/react-native/`](https://github.com/TanStack/router/tree/main/examples/react-native):

- **`bare`** — stock React Native + Metro (no Expo). Real native iOS
  project committed.
- **`expo-go`** — Expo with the Expo Go app (no custom native build).
  Router only.
- **`expo-dev-client`** — Expo with `expo run:ios` custom dev client.
  Recommended for most apps. Supports the full Router + Start matrix.

Each example ships Maestro flow skeletons under `.maestro/` for e2e
verification of navigation and deep linking.

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
