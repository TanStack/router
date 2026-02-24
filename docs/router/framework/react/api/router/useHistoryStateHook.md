---
id: useHistoryStateHook
title: useHistoryState hook
---

The `useHistoryState` hook returns the state object that was passed during navigation to the closest match or a specific route match.

## useHistoryState options

The `useHistoryState` hook accepts an optional `options` object.

### `opts.from` option

- Type: `string`
- Optional
- The route ID to get state from. If not provided, the state from the closest match will be used.

### `opts.strict` option

- Type: `boolean`
- Optional - `default: true`
- If `true`, the state object type will be strictly typed based on the route's `validateState`.
- If `false`, the hook returns a loosely typed `Partial<Record<string, unknown>>` object.

### `opts.shouldThrow` option

- Type: `boolean`
- Optional
- `default: true`
- If `false`, `useHistoryState` will not throw an invariant exception in case a match was not found in the currently rendered matches; in this case, it will return `undefined`.

### `opts.select` option

- Optional
- `(state: StateType) => TSelected`
- If supplied, this function will be called with the state object and the return value will be returned from `useHistoryState`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.

### `opts.structuralSharing` option

- Type: `boolean`
- Optional
- Configures whether structural sharing is enabled for the value returned by `select`.
- See the [Render Optimizations guide](../../guide/render-optimizations.md) for more information.

## useHistoryState returns

- The state object passed during navigation to the specified route, or `TSelected` if a `select` function is provided.
- Returns `undefined` if no match is found and `shouldThrow` is `false`.

## State Validation

You can validate the state object by defining a `validateState` function on your route:

```tsx
const route = createRoute({
  // ...
  validateState: (input) =>
    z
      .object({
        color: z.enum(['white', 'red', 'green']).catch('white'),
        key: z.string().catch(''),
      })
      .parse(input),
})
```

This ensures type safety and validation for your route's state.

## Examples

```tsx
import { useHistoryState } from '@tanstack/react-router'

// Get route API for a specific route
const routeApi = getRouteApi('/posts/$postId')

function Component() {
  // Get state from the closest match
  const state = useHistoryState()

  // OR

  // Get state from a specific route
  const routeState = useHistoryState({ from: '/posts/$postId' })

  // OR

  // Use the route API
  const apiState = routeApi.useHistoryState()

  // OR

  // Select a specific property from the state
  const color = useHistoryState({
    from: '/posts/$postId',
    select: (state) => state.color,
  })

  // OR

  // Get state without throwing an error if the match is not found
  const optionalState = useHistoryState({ shouldThrow: false })

  // ...
}
```

### Complete Example

```tsx
// Define a route with state validation
const postRoute = createRoute({
  getParentRoute: () => postsLayoutRoute,
  path: 'post',
  validateState: (input) =>
    z
      .object({
        color: z.enum(['white', 'red', 'green']).catch('white'),
        key: z.string().catch(''),
      })
      .parse(input),
  component: PostComponent,
})

// Navigate with state
function PostsLayoutComponent() {
  return (
    <Link
      to={postRoute.to}
      state={{
        color: 'red',
        key: 'test-value',
      }}
    >
      View Post
    </Link>
  )
}

// Use the state in a component
function PostComponent() {
  const post = postRoute.useLoaderData()
  const { color } = postRoute.useHistoryState()

  return (
    <div className="space-y-2">
      <h4 className="text-xl font-bold">{post.title}</h4>
      <h4 style={{ color }}>Colored by state</h4>
    </div>
  )
}
```
