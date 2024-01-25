---
id: createRouteFunction
title: createRoute function
---

The `createRoute` function implements returns a new `Route` instance. A route instance can then be passed to a root route's children to create a route tree, which is then passed to the router.

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

#### `lazy`

- Type: `(lazyImporter: () => Promise<Partial<UpdatableRouteOptions>>) => this`
- Updates the route instance with a new lazy importer which will be resolved lazily when loading the route. This can be useful for code splitting.
