# React Native Basic Example

This example exercises TanStack Router with `react-native-screens` and native stack transitions.

## Run

```bash
pnpm install
pnpm exec expo start --ios --clear
```

## Native Route Options

Routes can use a `native` option:

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

`stackState` supports:

- `active`: rendered and effects running
- `paused`: rendered and hidden with React `Activity`
- `detached`: not rendered, still in history

`stackState` also supports a function form:

```tsx
native: {
  stackState: ({ depth }) => {
    if (depth <= 2) return 'paused'
    return 'detached'
  },
}
```

## Stack Depth Lab Route

Use the depth lab from the comments screen:

- `/posts/$postId/deep/$depth`

Push multiple depth entries to exercise a mixed lifecycle policy:

- top entry: `active`
- previous 2 entries: `paused`
- deeper entries: `detached`

The depth lab screen also includes buttons to demo the new single-stack back API:

- `back()`
- `back({ steps: 2 })`
- `back({ to: '/posts/:id/deep' })`
- `back({ to: 'root' })`
- `back({ to: '/about', ifMissing: 'push' })`
