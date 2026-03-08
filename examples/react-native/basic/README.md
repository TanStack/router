# TanStack Router for React Native — Basic Example

> **`@tanstack/react-native-router` is currently in alpha.**

## Quick Start

```bash
# Clone this example
npx degit TanStack/router/examples/react-native/basic tanstack-rn-router-example
cd tanstack-rn-router-example

# Install deps
npm install

# Generate routes
npx @tanstack/router-cli generate

# Run on iOS
npx expo run:ios

# Or Android
npx expo run:android
```

## Development

Route generation + Expo dev server together:

```bash
npm run dev
```

Generate routes manually:

```bash
npm run routes:generate
```

Watch for route changes:

```bash
npm run routes:watch
```

## Deep Link Testing (Simulator)

This example configures router `native.linking` with:

- `tanstackrouter://`
- `https://tanstack-router-rn-example.local`

With the iOS simulator running and the app open:

```bash
xcrun simctl openurl booted "tanstackrouter://about"
xcrun simctl openurl booted "tanstackrouter://posts/1"
xcrun simctl openurl booted "https://tanstack-router-rn-example.local/posts/1/deep/2?view=debug"
```

If you are using Expo Go (not a dev build), test via the Expo URL form:

```bash
xcrun simctl openurl booted "exp://127.0.0.1:8082/--/about"
xcrun simctl openurl booted "exp://127.0.0.1:8082/--/posts/1/deep/2?view=debug"
xcrun simctl openurl booted "exp://127.0.0.1:8082/--/posts?q=sunt"
```

Expected behavior:

- initial launch deep link uses `push` (so Home remains available via back)
- initial launch deep-link push is non-animated by default
- links received while app is open use `push`
- router path/search/hash reflect the incoming URL

## Native Route Options

Routes can use a `native` option:

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

`native` options are inherited through route ancestors, so shared header and
presentation defaults can live at parent routes (this example sets global
header defaults in `__root.tsx`).

`native` can also be a function (same spirit as `head`) and read route
`loaderData`:

```tsx
native: ({ loaderData, params }) => ({
  title:
    (loaderData as { post?: { title?: string } } | undefined)?.post?.title ??
    `Post #${params.postId}`,
})
```

Header options also live under `native`:

```tsx
native: {
  title: 'Posts',
  headerTintColor: '#fff',
  headerStyle: { backgroundColor: '#6366f1' },
  headerRight: () => <MyButton />,
}
```

Use `native.header` as an escape hatch for fully custom headers.

`minStackState` supports:

- `paused`: this entry will never be detached
- `active`: this entry will never be paused or detached

Use `defaultMinStackState` to set a default for a route subtree:

```tsx
native: {
  defaultMinStackState: 'paused',
}
```

## Stack Depth Lab Route

Use the depth lab from the welcome screen:

- `/posts/$postId/deep/$depth`

Push multiple depth entries to exercise lifecycle policy with minimum clamps.

Depth lab now includes an explicit min-state playground for:

- `navigate({ native: { minStackState } })`
- `<Link native={{ minStackState }}>`
- `stackBehavior: 'reuse'` with metadata override

It also includes a per-second side-effect counter so you can observe how hidden entries are paused by the `<Activity>` boundary.

The depth lab UI includes a native stack debugger panel that shows observed entries with inferred `active` / `paused` / `detached` state.

The depth lab screen also includes buttons to demo the new single-stack back API:

- `back()`
- `back({ steps: 2 })`
- `back({ to: '/posts/:id/deep' })`
- `back({ to: 'root' })`
- `back({ to: '/about', ifMissing: 'push' })`

React Native navigation also supports stack reuse controls on `navigate` and `<Link>`:

- `stackBehavior: 'auto' | 'push' | 'replace' | 'reuse'`
- `stackMatch: 'nearest' | 'oldest'`
- `entryId: string`
