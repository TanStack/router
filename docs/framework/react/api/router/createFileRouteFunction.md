---
id: createFileRouteFunction
title: createFileRoute function
---

The `createFileRoute` function is a factory that can be used to create a file-based route instance. This route instance can then be used to automatically generate a route tree with the `tsr generate` and `tsr watch` commands.

## createFileRoute options

The `createFileRoute` function accepts a single argument of type `string` that represents the `path` of the file that the route will be generated from.

### `path`

- Type: `string` literal
- Required, but **automatically inserted and updated by the `tsr generate` and `tsr watch` commands**
- The full path of the file that the route will be generated from

## createFileRoute returns

- A new [`FileRoute`](../FileRouteClass) instance.

> ⚠️ Note: For `tsr generate` and `tsr watch` to work properly, the file route instance must be exported from the file using the `Route` identifier.

## Examples

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  loader: () => {
    return 'Hello World'
  },
  component: IndexComponent,
})

function IndexComponent() {
  const data = Route.useLoaderData()
  return <div>{data}</div>
}
```
