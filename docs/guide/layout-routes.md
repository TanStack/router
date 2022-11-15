---
title: Layout Routes
---

Layout routes are routes that do not have a path, but allows wrapping it's child routes with wrapper components or shared logic. Layout routes are useful for:

- Wrapping child routes with a layout component
- Sharing a loader between all of the child routes
- Sharing search params between all of the child routes
- Sharing an error component with all child routes

To create a layout route, define a route config with an `id` property instead of a `path`:

```tsx
const routeConfig = createRouteConfig().createChildren((createRoute) => [
  createRoute({
    id: 'layout',
  }).createChildren((createRoute) => [
    createRoute({
      path: 'layout-a',
    }),
    createRoute({
      path: 'layout-b',
    }),
  ]),
])
```

In the above example, the `layout` route will not add or match any path in the URL, but will wrap the `layout-a` and `layout-b` routes with any elements or logic defined in it.

> 🧠 An ID is required because every route must be uniquely identifiable, especially when using TypeScript so as to avoid type errors and accomplish autocomplete effectively.

## Examples

> TODO! If you'd like to help add examples, use the "Edit on Github" link at the bottom of this page to submit a PR!
