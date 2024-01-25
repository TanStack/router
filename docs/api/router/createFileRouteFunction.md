---
id: createFileRouteFunction
title: createFileRoute function
---

The `createFileRoute` function is a factory that can be used to create a file-based route instance. This route instance can then be used to automatically generate a route tree with the `tsr generate` and `tsr build` commands.

### Options

#### `path`

- Type: `string` literal
- Required, but **automatically inserted and updated by the `tsr generate` and `tsr build` commands**
- The full path of the file that the route will be generated from

### Returns

- A new `FileRoute` instance

### `FileRoute` methods

#### `createRoute` method

The `createRoute` method is a method that can be used to configure the file route instance.

### `createRoute` options

#### `options`

- Type: `Omit<RouteOptions, 'getParentRoute' | 'path' | 'id'>`
- Optional
- The same options that are available to the `Route` class, but with the `getParentRoute`, `path`, and `id` options omitted since they are unnecessary for file-based routing.

### Returns

- A `Route` instance that can be used to create a route tree

> ⚠️ Note: For `tsr generate` and `tsr build` to work properly, the file route instance must be exported from the file using the `Route` identifier.

### Examples

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const rootRoute = createFileRoute('/')({
  loader: () => {
    return 'Hello World'
  },
  component: IndexComponent,
})

function IndexComponent() {
  const data = rootRoute.useLoaderData()
  return <div>{data}</div>
}
```
