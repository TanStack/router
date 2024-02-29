---
id: useParamsHook
title: useParams
---

The `useParams` method returns all of the path parameters that were parsed for the closest match and all of its parent matches.

## useParams `options`

The `useParams` hook accepts an optional `options` object.

### `opts.strict` option

- Type: `boolean`
- Optional - `default: true`
- If `false`, the `opts.from` option will be ignored and types will be loosened to `Partial<AllParams>` to reflect the shared types of all params.

### `opts.select` option

- Optional
- `(params: AllParams) => TSelected`
- If supplied, this function will be called with the params object and the return value will be returned from `useParams`. This value will also be used to determine if the hook should re-render its parent component using shallow equality checks.

## useParams `returns`

- An object of of the match's and parent match path params or `TSelected` if a `select` function is provided.

## Examples

```tsx
import { useParams } from '@tanstack/react-router'

const routeApi = getRouteApi('/posts/$postId')

function Component() {
  const params = useParams({ from: '/posts/$postId' })

  // OR

  const routeParams = routeApi.useParams();

  // OR

  const postId = useParams({
    from: '/posts/$postId',
    select: (params) => params.postId,
  })

  // OR

  const looseParams = useParams({ strict: false })
  
  // ...
}
```
