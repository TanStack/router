---
id: RootRouteClass
title: RootRoute class
---

> 🚧 The `RootRoute` class is deprecated and will be removed in the next major version of TanStack Router. Please use the [`createRootRoute`](./api/router/createRootRouteFunction) function instead.

The `RootRoute` class extends the `Route` class and can be used to create a root route instance. A root route instance can then be used to create a route tree.

## `RootRoute` constructor

The `RootRoute` constructor accepts an object as its only argument.

### Constructor `options`

- Type:

```tsx
Omit<
  RouteOptions,
  | 'path'
  | 'id'
  | 'getParentRoute'
  | 'caseSensitive'
  | 'parseParams'
  | 'stringifyParams'
>
```

- [RouteOptions](./api/router/RouteOptionsType)
- Required
- The options that will be used to configure the root route instance.

## `RootRoute` methods

The `RootRoute` class implements the following method(s):

### `.addChildren` method

- Type: `(children: Route[]) => this`
- Adds child routes to the root route instance and returns the root route instance (but with updated types to reflect the new children)

### `.update` method

- Type: `(options: Partial<UpdatableRouteOptions>) => this`
- Updates the root route instance with new options and returns the root route instance (but with updated types to reflect the new options)
- In some circumstances, it can be useful to update a root route instance's options after it has been created to avoid circular type references.
