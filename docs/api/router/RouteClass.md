---
id: RouteClass
title: Route class
---

The `Route` class implements the `RouteApi` class and can be used to create route instances. A route instance can then be used to create a route tree.

### `Route` constructor

#### `options`

- Type: `RouteOptions`
- Required
- The options that will be used to configure the route instance

### `Route` methods

#### `addChildren`

- Type: `(children: Route[]) => this`
- Adds child routes to the route instance and returns the route instance (but with updated types to reflect the new children)

#### `update`

- Type: `(options: Partial<UpdatableRouteOptions>) => this`
- Updates the route instance with new options and returns the route instance (but with updated types to reflect the new options)
- In some circumstances, it can be useful to update a route instance's options after it has been created to avoid circular type references.
- ...`RouteApi` methods
  - All of the methods from the `RouteApi` class are available on the `Route` class
