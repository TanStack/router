---
title: Router Context
---

TanStack Router's router context is a very powerful tool that can be used for dependency injection among many other things. Aptly named, the router context is a context that is passed through the router, all the down the route tree. At each route in the hierarchy, the context can be modified or added to. Here's a few ways you might use the router context practically:

- Dependency injection
  - You can supply dependencies (e.g. a data loader client or mutation service) which all child routes can access and use without importing them directly.
- Breadcrumbs
  - While the main context object for each route is merged as it descends, each route's unique context is also stored making it possible to attach breadcrumbs or methods to each route's context.
- Dynamic meta tag management
  - You can attach meta tags to each route's context and then use a meta tag manager to dynamically update the meta tags on the page as the user navigates the site.

These are just suggested uses of the router context. You can use it for whatever you want!

## Typed Router Context

Like everything else, the router context (at least the one you inject at `new Router()` is strictly typed. This type can be augemented via routes' `getContext` option. If that's the case, the type at the edge of the route is a merged interface-like type of the base context type and every route's `getContext` return type. To constrain the type of the router context, you must use the `RootRoute.withRouterContext()` factory instead of the `new RootRoute()` constructor. Here's an example:

```tsx
import { RootRoute } from '@tanstack/router'

interface MyRouterContext {
  user: User
}

const rootRoute = RootRoute.withRouterContext<MyRouterContext>()({
  component: App,
})
```

> ⚠️ Did you notice the curried call above? Make sure you first call `RootRoute.withRouterContext<MyRouterContext>()` and then call the returned function with the route options. This is a requirement of the `RootRoute.withRouterContext` factory.

## Passing the initial Router Context

The router context is passed to the router at instantiation time. You can pass the initial router context to the router via the `initialRouterContext` option:

> 🧠 If your context has any required properties, you will see a TypeScript error if you don't pass them in the initial router context. If all of your context properties are optional, you will not see a TypeScript error and passing the context will be optional. If you don't pass a router context, it defaults to `{}`.

```tsx
import { Router } from '@tanstack/router'

const router = new Router({
  routeTree,
  context: {
    user: {
      id: '123',
      name: 'John Doe',
    },
  },
})
```

## Using the Router Context

Once you have defined the router context type, you can use it in your route definitions:

```tsx
import { Route } from '@tanstack/router'

const userRoute = Route({
  getRootRoute: () => rootRoute,
  path: 'todos',
  component: Todos,
  onLoad: ({ context }) => {
    await todosLoader.load({ variables: { user: context.user.id } })
  },
})
```

You can even inject your data fetching client itself!

```tsx
import { RootRoute } from '@tanstack/router'

interface MyRouterContext {
  queryClient: QueryClient
}

const rootRoute = RootRoute.withRouterContext<MyRouterContext>()({
  component: App,
})

const queryClient = new QueryClient()

const router = new Router({
  routeTree: rootRoute,
  context: {
    queryClient,
  },
})
```

Then, in your route:

```tsx
import { Route } from '@tanstack/router'

const userRoute = Route({
  getRootRoute: () => rootRoute,
  path: 'todos',
  component: Todos,
  onLoad: ({ context }) => {
    await context.queryClient.ensureQueryData({
      queryKey: ['todos', { userId: user.id }],
      queryFn: fetchTodos,
    })
  },
})
```

## Modifying the Router Context

The router context is passed down the route tree and is merged at each route. This means that you can modify the context at each route and the modifications will be available to all child routes. Here's an example:

```tsx
import { RootRoute, Route } from '@tanstack/router'

interface MyRouterContext {
  foo: boolean
}

const rootRoute = RootRoute.withRouterContext<MyRouterContext>()({
  component: App,
})

const router = new Router({
  routeTree: rootRoute,
  context: {
    foo: true,
  },
})

const userRoute = Route({
  getRootRoute: () => rootRoute,
  path: 'admin',
  component: Todos,
  getContext: () => {
    return {
      bar: true,
    }
  }
  onLoad: ({ context }) => {
    context.foo // true
    context.bar // true
  },
})
```

## Unique Route Context

In addition to the merged context, each route also has a unique context that is stored under the `routeContext` key. This context is not merged with the parent context. This means that you can attach unique data to each route's context. Here's an example:

```tsx
export const postIdRoute = new Route({
  getParentRoute: () => postsRoute,
  path: '$postId',
  component: Post,
  getContext: ({ context: { loaderClient }, params: { postId } }) => {
    const loader = loaderClient.getLoader({ key: 'post' })
    const loaderInstance = loader.getInstance({ variables: postId })

    return {
      loader,
      loaderInstance,
      getTitle: () => `${loaderInstance.state.data?.title} | Post`,
    }
  },
  onLoad: async ({ params: { postId }, preload, context, routeContext }) =>
    routeContext.loaderInstance.load({
      variables: postId,
      preload,
    }),
})
```

## Process Accumulated Route Context

Context, especially the isolated `routeContext` objects, make it trivial to accumulate and process the route context objects for all matched routes. Here's an example where we use all of the matched route contexts to generate a breadcrumb trail:

```tsx
const rootRoute = RootRoute({
  component: () => {
    const router = useRouter()

    const breadcrumbs = router.state.currentMatches.map((match) => {
      const { routeContext } = match
      return {
        title: routeContext.getTitle(),
        path: match.path,
      }
    })

    // ...
  },
})
```

Using that same route context, we could also generate a title tag for our page's `<head>`:

```tsx
const rootRoute = RootRoute({
  component: () => {
    const router = useRouter()

    const matchWithTitle = [...router.state.currentMatches]
      .reverse()
      .find((d) => d.routeContext.getTitle)

    const title = matchWithTitle?.routeContext.getTitle() || 'My App'

    return (
      <html>
        <head>
          <title>{title}</title>
        </head>
        <body>{/* ... */}</body>
      </html>
    )
  },
})
```
