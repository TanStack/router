---
id: FileRouteClass
title: FileRoute class
---

## ⚠️ Deprecated

The `FileRoute` class is deprecated and will be removed in the next major version of TanStack Router. Please use the `createFileRoute` function instead.

The `FileRoute` class is a factory that can be used to create a file-based route instance. This route instance can then be used to automatically generate a route tree with the `tsr generate` and `tsr build` commands.

### `FileRoute` constructor

#### `path`

- Type: `string` literal
- Required, but **automatically inserted and updated by the `tsr generate` and `tsr build` commands**
- The full path of the file that the route will be generated from

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
import { FileRoute } from '@tanstack/react-router'

export const rootRoute = new FileRoute('/').createRoute({
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
