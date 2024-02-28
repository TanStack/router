---
id: RouteClass
title: Route class
---

> 🚧 The `Route` class is deprecated and will be removed in the next major version of TanStack Router. Please use the [`createRoute`](./api/router/createRouteFunction) function instead.

The `Route` class implements the `RouteApi` class and can be used to create route instances. A route instance can then be used to create a route tree.

## `Route` constructor

The `Route` constructor accepts an object as its only argument.

### Constructor `options`

- Type: [`RouteOptions`](./api/router/RouteOptionsType)
- Required
- The options that will be used to configure the route instance

## `Route` methods

The `Route` class implements the following method(s):

### `.addChildren` method

- Type: `(children: Route[]) => this`
- Adds child routes to the route instance and returns the route instance (but with updated types to reflect the new children).

### `.update` method

- Type: `(options: Partial<UpdatableRouteOptions>) => this`
- Updates the route instance with new options and returns the route instance (but with updated types to reflect the new options).
- In some circumstances, it can be useful to update a route instance's options after it has been created to avoid circular type references.
- ...`RouteApi` methods

### `.lazy` method

- Type: `(lazyImporter: () => Promise<Partial<UpdatableRouteOptions>>) => this`
- Updates the route instance with a new lazy importer which will be resolved lazily when loading the route. This can be useful for code splitting.

### ...`RouteApi` methods
- All of the methods from the [`RouteApi`](./api/router/RouteApiClass) class are available on the `Route` class.
