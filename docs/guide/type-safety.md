---
title: Type Safety
---

TanStack Router is built to be _extremely_ type-safe. This means that it's not only written in TypeScript, but that it also **fully infers the types it's provided and tenaciously pipes them through the entire routing experience**.

Ultimately, this means that you write **less types as a developer** and have **more confidence in your code** as it evolves.

## Route Definitions

Routes are hierarchical, and so are their definitions. The reason you see a `getParentRoute` in your route definitions is because child routes need to be aware of **all** of their parent routes types. Without this, those precious search params you parsed out of your layout route 3 levels up would be lost to the JS void.

Don't forget to pass the parent route to your child routes!

```tsx
const parentRoute = new Route({
  getParentRoute: () => parentRoute,
})
```

## Exported Hooks, Components, and Utilities

For the types of your router to work with top-level exports like `Link`, `useNavigate`, `useParams`, etc. they must permeate the type-script module boundary and be registered right into the library. To do this, we use declaration merging on the exported `Register` interface.

```ts
const router = new Router({
  // ...
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```

By registering your router with the module, you can now use the exported hooks, components, and utilities with your router's exact types.

## Fixing the Component Context Problem

Component context is a wonderful tool in React and other frameworks for providing dependencies to components. However, if that context is changing types as it moves throughout your component hierarchy, it becomes impossible for TypeScript to know how to infer those changes. To get around this, context-based hooks and components require that you give them a hint on where they are being used.

```tsx
const postsRoute = new Route({
  component: () => {
    // By passing the `from` param, we're telling the hook that we're using it in the context of the `postsRoute`
    const params = useParams({ from: postsRoute.id })
    const navigate = useNavigate({ from: postsRoute.id })
    const search = useSearch({ from: postsRoute.id })
    // ... etc
  },
})
```

Every hook and component that requires a context hint will have a `from` param where you can pass the ID or path of the route you are rendering within.

### What if I don't know the route? What if it's a shared component?

The `from` property is optional, which means if you don't pass it, you'll get the router's best guess on what types will be available. Usually that means you'll get a nullable intersection of all of the types of all of the routes in the router.

## Router Context

Router context is so extremely useful as it's the ultimate hierarchical dependency injection. You can supply context to the router and to each and every route it renders. As you build up this context, TanStack Router will merge it down with the hierarchy of routes, so that each route has access to the context of all of its parents.

If you want to use context, it's highly recommended that you use the `RootRoute.withRouterContext<ContextType>()(rootRouteOptions)` utility.

This utility will create a requirement for you to pass a context type to your router, and will also ensure that your context is properly typed throughout the entire route tree.

```tsx
const rootRoute = new RootRoute.withRouterContext<{ whateverYouWant: true }>()({
  component: () => {
    // ...
  },
})

const routeTree = rootRoute.addChildren([
  // ... all child routes will have access to `whateverYouWant` in their context
])

const router = new Router({
  routeTree,
  context: {
    // This will be required to be passed now
    whateverYouWant: true,
  },
})
```
