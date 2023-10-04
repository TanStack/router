---
title: Router Context
---

TanStack Router's router context is a very powerful tool that can be used for dependency injection among many other things. Aptly named, the router context is passed through the router and down through each matching route. At each route in the hierarchy, the context can be modified or added to. Here's a few ways you might use the router context practically:

- Dependency Injection
  - You can supply dependencies (e.g. a loader function, a data fetching client, a mutation service) which the route and all child routes can access and use without importing or creating directly.
- Breadcrumbs
  - While the main context object for each route is merged as it descends, each route's unique context is also stored making it possible to attach breadcrumbs or methods to each route's context.
- Dynamic meta tag management
  - You can attach meta tags to each route's context and then use a meta tag manager to dynamically update the meta tags on the page as the user navigates the site.

These are just suggested uses of the router context. You can use it for whatever you want!

## Typed Router Context

Like everything else, the root router context is strictly typed. This type can be augmented via any route's `beforeLoad` option as it is merged down the route match tree. To constrain the type of the root router context, you must use the `new RouteContext<YourContextTypeHere>()` class to create a new `routerContext` and then use the `routerContext.createRootRoute()` method instead of the `new RootRoute()` class to create your root route. Here's an example:

```tsx
import { RootRoute } from '@tanstack/react-router'

interface MyRouterContext {
  user: User
}

const routerContext = new RouterContext<MyRouterContext>()

// Use the routerContext to create your root route
const rootRoute = routerContext.createRootRoute({
  component: App,
})

const routeTree = rootRoute.addChildren([
  // ...
])

// Use the routerContext to create your router
const router = new Router({
  routeTree,
})
```

## Passing the initial Router Context

The router context is passed to the router at instantiation time. You can pass the initial router context to the router via the `initialRouterContext` option:

> 🧠 If your context has any required properties, you will see a TypeScript error if you don't pass them in the initial router context. If all of your context properties are optional, you will not see a TypeScript error and passing the context will be optional. If you don't pass a router context, it defaults to `{}`.

```tsx
import { Router } from '@tanstack/react-router'

// Use the routerContext you created to create your router
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
import { Route } from '@tanstack/react-router'

const userRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'todos',
  component: Todos,
  loader: ({ context }) => fetchTodosByUserId(context.user.id),
})
```

You can even inject data fetching and mutation implementations themselves! In fact, this is highly recommended 😜

Let's try this with a simple function to fetch some todos:

```tsx
import { RootRoute } from '@tanstack/react-router'

const fetchTodosByUserId = async ({ userId }) => {
  const response = await fetch(`/api/todos?userId=${userId}`)
  const data = await response.json()
  return data
}

const router = new Router({
  routeTree: rootRoute,
  context: {
    userId: '123',
    fetchTodosByUserId,
  },
})
```

Then, in your route:

```tsx
import { Route } from '@tanstack/react-router'

const userRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'todos',
  component: Todos,
  loader: ({ context }) => context.fetchTodosByUserId(context.userId),
})
```

### How about an external data fetching library?

```tsx
import { RootRoute } from '@tanstack/react-router'

interface MyRouterContext {
  queryClient: QueryClient
}

const routerContext = new RouterContext<MyRouterContext>()

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
import { Route } from '@tanstack/react-router'

const userRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'todos',
  component: Todos,
  loader: ({ context }) => {
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
import { RootRoute, Route } from '@tanstack/react-router'

interface MyRouterContext {
  foo: boolean
}

const routerContext = new RouterContext<MyRouterContext>()

const rootRoute = routerContext.createRootRoute({
  component: App,
})

const router = new Router({
  routeTree: rootRoute,
  context: {
    foo: true,
  },
})

const userRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'admin',
  component: Todos,
  beforeLoad: () => {
    return {
      bar: true,
    }
  }
  loader: ({ context }) => {
    context.foo // true
    context.bar // true
  },
})
```

## Unique Route Context

While the main router context is merged as it descends, each route's unique context is also stored making it a nice place to pass configuration or implementation details specific to your route. Here's an example where we use the route context to generate a title for each route:

```tsx
export const postIdRoute = new Route({
  getParentRoute: () => postsRoute,
  path: '$postId',
  component: Post,
  beforeLoad: ({ context: { queryClient }, params: { postId } }) => {
    const queryOptions = {
      queryKey: ['posts', 'post', postId],
      queryFn: () => fetchPostById(postId),
    }

    return {
      queryOptions,
      getTitle: () => `${queryClient.getQueryData(queryOptions)?.title} | Post`,
    }
  },
  loader: async ({ preload, context: { queryClient, queryOptions } }) => {
    await queryClient.ensureQueryData(queryOptions)
  },
  component: ({ useRouteContext }) => {
    const { queryOptions } = useRouteContext()

    const { data } = useQuery(queryOptions)

    return (
      <div>
        <h1>{data.title}</h1>
        <p>{data.body}</p>
      </div>
    )
  },
})
```

## Processing Accumulated Route Context

Context, especially the isolated `routeContext` objects, make it trivial to accumulate and process the route context objects for all matched routes. Here's an example where we use all of the matched route contexts to generate a breadcrumb trail:

```tsx
const rootRoute = RootRoute({
  component: () => {
    const router = useRouter()

    const breadcrumbs = router.state.matches.map((match) => {
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

    const matchWithTitle = [...router.state.matches]
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
