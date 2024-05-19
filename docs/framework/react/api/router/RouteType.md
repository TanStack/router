---
id: RouteType
title: Route type
---

The `Route` type is used to describe a route instance.

## `Route` properties and methods

An instance of the `Route` has the following properties and methods:

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

- All of the methods from [`RouteApi`](../RouteApiType) are available.
