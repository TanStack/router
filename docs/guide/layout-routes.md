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
const rootRoute = createRouteConfig()

// Our layout route
const layoutRoute = rootRoute.createRoute({
  id: 'layout',
})

const layoutARoute = layoutRoute.createRoute({
  path: 'layout-a',
})

const layoutBRoute = layoutRoute.createRoute({
  path: 'layout-b',
})

const routeConfig = rootRoute.addChildren([
  layoutRoute.addChildren([layoutARoute, layoutBRoute]),
])
```

In the above example, the `layout` route will not add or match any path in the URL, but will wrap the `layout-a` and `layout-b` routes with any elements or logic defined in it.

> 🧠 An ID is required because every route must be uniquely identifiable, especially when using TypeScript so as to avoid type errors and accomplish autocomplete effectively.

## Examples

Simple example with different layouts for authenticated and unauthenticated routes

```tsx
const rootRoute = createRouteConfig();

const layoutRoot = rootRoute.createRoute({
  id: "layout",
});

const layoutUnauth = layoutRoot.createRoute({
  id: "layout-unauth",
  component: LayoutUnauth, // layout component for unauthenticated routes
});

const layoutAuth = layoutRoot.createRoute({
  id: "layout-auth",
  component: LayoutAuth, // layout component for authenticated routes
});

const indexRoute = layoutUnauth.createRoute({
  path: "/",
  component: LandingPage, // landing page component that will use unauthenticated layout
});

const dashboardRoute = layoutAuth.createRoute({
  path: "app",
  component: DashboardPage, // homepage page component that will use authenticated layout
  },
});

export const loginRoute = layoutUnauth.createRoute({
  path: "login",
  component: LoginPage, // another component that will unauthenticated layout 
});

const routeConfig = rootRoute.addChildren([
  layoutRoot.addChildren([
    layoutUnauth.addChildren([indexRoute, loginRoute]),
    layoutAuth.addChildren([dashboardRoute]),
  ]),
]);
```
