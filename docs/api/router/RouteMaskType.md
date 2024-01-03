---
id: RouteMaskType
title: `RouteMask` type
---


The `RouteMask` type extends the ToOptions type and has other the necessary properties to create a route mask.

### Properties

#### `...ToOptions`

- Type: `ToOptions`
- Required
- The options that will be used to configure the route mask

#### `options.routeTree`

- Type: `TRouteTree`
- Required
- The route tree that this route mask will support

#### `options.unmaskOnReload`

- Type: `boolean`
- Optional
- If `true`, the route mask will be removed when the page is reloaded
