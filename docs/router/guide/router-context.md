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

Like everything else, the root router context is strictly typed. This type can be augmented via any route's `context` or `beforeLoad` option as it is merged down the route match tree. To constrain the type of the root router context, you must use the `createRootRouteWithContext<YourContextTypeHere>()(routeOptions)` function to create a new router context instead of the `createRootRoute()` function to create your root route. Here's an example:

<!-- ::start:framework -->

# React

```tsx
import {
  createRootRouteWithContext,
  createRouter,
} from '@tanstack/react-router'

interface MyRouterContext {
  user: User
}

// Use the routerContext to create your root route
const rootRoute = createRootRouteWithContext<MyRouterContext>()({
  component: App,
})

const routeTree = rootRoute.addChildren([
  // ...
])

// Use the routerContext to create your router
const router = createRouter({
  routeTree,
})
```

# Solid

```tsx
import {
  createRootRouteWithContext,
  createRouter,
} from '@tanstack/solid-router'

interface MyRouterContext {
  user: User
}

// Use the routerContext to create your root route
const rootRoute = createRootRouteWithContext<MyRouterContext>()({
  component: App,
})

const routeTree = rootRoute.addChildren([
  // ...
])

// Use the routerContext to create your router
const router = createRouter({
  routeTree,
})
```

<!-- ::end:framework -->

> [!TIP]
> `MyRouterContext` only needs to contain content that will be passed directly to `createRouter` below. All other context added in `context` or `beforeLoad` will be inferred.

## Passing the initial Router Context

The router context is passed to the router at instantiation time. You can pass the initial router context to the router via the `context` option:

> [!TIP]
> If your context has any required properties, you will see a TypeScript error if you don't pass them in the initial router context. If all of your context properties are optional, you will not see a TypeScript error and passing the context will be optional. If you don't pass a router context, it defaults to `{}`.

<!-- ::start:framework -->

# React

```tsx
import { createRouter } from '@tanstack/react-router'

// Use the routerContext you created to create your router
const router = createRouter({
  routeTree,
  context: {
    user: {
      id: '123',
      name: 'John Doe',
    },
  },
})
```

# Solid

```tsx
import { createRouter } from '@tanstack/solid-router'

// Use the routerContext you created to create your router
const router = createRouter({
  routeTree,
  context: {
    user: {
      id: '123',
      name: 'John Doe',
    },
  },
})
```

<!-- ::end:framework -->

### Reloading after the context changed

When the state behind the router context changes, call `router.invalidate()`. The router reloads the matched routes: every `beforeLoad` and every loader runs again and sees the current context. A route's own `context` option is cached per match and is not re-run by `invalidate()` unless the route sets `revalidate`; see [The route `context` option](#the-route-context-option) below.

<!-- ::start:framework -->

# React

```tsx
function useAuth() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user)
      router.invalidate()
    })

    return unsubscribe
  }, [])

  return user
}
```

# Solid

```tsx
function useAuth() {
  const router = useRouter()
  const [user, setUser] = createSignal<User | null>(null)

  createEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user)
      router.invalidate()
    })

    return unsubscribe
  }, [])

  return user()
}
```

<!-- ::end:framework -->

## Using the Router Context

Once you have defined the router context type, you can use it in your route definitions:

```tsx
// src/routes/todos.tsx
export const Route = createFileRoute('/todos')({
  component: Todos,
  loader: ({ context }) => fetchTodosByUserId(context.user.id),
})
```

You can even inject data fetching and mutation implementations themselves! In fact, this is highly recommended 😜

Let's try this with a simple function to fetch some todos:

```tsx
const fetchTodosByUserId = async ({ userId }) => {
  const response = await fetch(`/api/todos?userId=${userId}`)
  const data = await response.json()
  return data
}

const router = createRouter({
  routeTree: rootRoute,
  context: {
    userId: '123',
    fetchTodosByUserId,
  },
})
```

Then, in your route:

```tsx
// src/routes/todos.tsx
export const Route = createFileRoute('/todos')({
  component: Todos,
  loader: ({ context }) => context.fetchTodosByUserId(context.userId),
})
```

### How about an external data fetching library?

<!-- ::start:framework -->

# React

```tsx
import {
  createRootRouteWithContext,
  createRouter,
} from '@tanstack/react-router'

interface MyRouterContext {
  queryClient: QueryClient
}

const rootRoute = createRootRouteWithContext<MyRouterContext>()({
  component: App,
})

const queryClient = new QueryClient()

const router = createRouter({
  routeTree: rootRoute,
  context: {
    queryClient,
  },
})
```

# Solid

```tsx
import {
  createRootRouteWithContext,
  createRouter,
} from '@tanstack/solid-router'

interface MyRouterContext {
  queryClient: QueryClient
}

const rootRoute = createRootRouteWithContext<MyRouterContext>()({
  component: App,
})

const queryClient = new QueryClient()

const router = createRouter({
  routeTree: rootRoute,
  context: {
    queryClient,
  },
})
```

<!-- ::end:framework -->

Then, in your route:

```tsx
// src/routes/todos.tsx
export const Route = createFileRoute('/todos')({
  component: Todos,
  loader: async ({ context }) => {
    await context.queryClient.query({
      queryKey: ['todos', { userId: user.id }],
      queryFn: fetchTodos,
      staleTime: 'static',
    })
  },
})
```

<!-- ::start:framework -->

# React

## How about using React Context/Hooks?

When trying to use React Context or Hooks in your route's `beforeLoad` or `loader` functions, it's important to remember React's [Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks). You can't use hooks in a non-React function, so you can't use hooks in your `beforeLoad` or `loader` functions.

So, how do we use React Context or Hooks in our route's `beforeLoad` or `loader` functions? We can use the router context to pass down the React Context or Hooks to our route's `beforeLoad` or `loader` functions.

Let's look at the setup for an example, where we pass down a `useNetworkStrength` hook to our route's `loader` function:

<!-- ::start:tabs variant="files" -->

```tsx title="src/routes/__root.tsx"
// First, make sure the context for the root route is typed
import { createRootRouteWithContext } from '@tanstack/react-router'
import { useNetworkStrength } from '@/hooks/useNetworkStrength'

interface MyRouterContext {
  networkStrength: ReturnType<typeof useNetworkStrength>
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: App,
})
```

<!-- ::end:tabs -->

In this example, we'd instantiate the hook before rendering the router using the `<RouterProvider />`. This way, the hook would be called in React-land, therefore adhering to the Rules of Hooks.

<!-- ::start:tabs variant="files" -->

```tsx title="src/router.tsx"
import { createRouter } from '@tanstack/react-router'

import { routeTree } from './routeTree.gen'

export const router = createRouter({
  routeTree,
  context: {
    networkStrength: undefined!, // We'll set this in React-land
  },
})
```

<!-- ::end:tabs -->

Then, we can call the `useNetworkStrength` hook in our `App` component and pass the returned value into the router context via the `<RouterProvider />`:

<!-- ::start:tabs variant="files" -->

```tsx title="src/main.tsx"
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'

import { useNetworkStrength } from '@/hooks/useNetworkStrength'

function App() {
  const networkStrength = useNetworkStrength()
  // Inject the returned value from the hook into the router context
  return <RouterProvider router={router} context={{ networkStrength }} />
}

// ...
```

<!-- ::end:tabs -->

So, now in our route's `loader` function, we can access the `networkStrength` hook from the router context:

<!-- ::start:tabs variant="files" -->

```tsx title="src/routes/posts.tsx"
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({
  component: Posts,
  loader: ({ context }) => {
    if (context.networkStrength === 'STRONG') {
      // Do something
    }
  },
})
```

<!-- ::end:tabs -->

<!-- ::end:framework -->

## Modifying the Router Context

The router context is passed down the route tree and is merged at each route. This means that you can modify the context at each route and the modifications will be available to all child routes. Two route options contribute to it: `context`, which runs first and is cached per match, and `beforeLoad`, which runs on every load. This example uses `beforeLoad`; the `context` option is described in [The route `context` option](#the-route-context-option). Here's an example:

<!-- ::start:framework -->

# React

<!-- ::start:tabs variant="files" -->

```tsx title="src/routes/__root.tsx"
import { createRootRouteWithContext } from '@tanstack/react-router'

interface MyRouterContext {
  foo: boolean
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: App,
})
```

<!-- ::end:tabs -->

<!-- ::start:tabs variant="files" -->

```tsx title="src/router.tsx"
import { createRouter } from '@tanstack/react-router'

import { routeTree } from './routeTree.gen'

const router = createRouter({
  routeTree,
  context: {
    foo: true,
  },
})
```

<!-- ::end:tabs -->

<!-- ::start:tabs variant="files" -->

```tsx title="src/routes/todos.tsx"
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/todos')({
  component: Todos,
  beforeLoad: () => {
    return {
      bar: true,
    }
  },
  loader: ({ context }) => {
    context.foo // true
    context.bar // true
  },
})
```

<!-- ::end:tabs -->

# Solid

<!-- ::start:tabs variant="files" -->

```tsx title="src/routes/__root.tsx"
import { createRootRouteWithContext } from '@tanstack/solid-router'

interface MyRouterContext {
  foo: boolean
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: App,
})
```

<!-- ::end:tabs -->

<!-- ::start:tabs variant="files" -->

```tsx title="src/router.tsx"
import { createRouter } from '@tanstack/solid-router'

import { routeTree } from './routeTree.gen'

const router = createRouter({
  routeTree,
  context: {
    foo: true,
  },
})
```

<!-- ::end:tabs -->

<!-- ::start:tabs variant="files" -->

```tsx title="src/routes/todos.tsx"
import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/todos')({
  component: Todos,
  beforeLoad: () => {
    return {
      bar: true,
    }
  },
  loader: ({ context }) => {
    context.foo // true
    context.bar // true
  },
})
```

<!-- ::end:tabs -->

<!-- ::end:framework -->

## The route `context` option

> **Experimental:** the route `context` option is experimental and subject to change.

A route can contribute to the context with the `context` option. It runs before the route's `beforeLoad`, its result is merged into the context that `beforeLoad`, `loader`, the components and every child route see, and it is computed once per match.

```tsx
// src/routes/posts.$postId.tsx
export const Route = createFileRoute('/posts/$postId')({
  context: ({ params }) => ({
    postQueryOptions: postQueryOptions(params.postId),
  }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(context.postQueryOptions),
})
```

This is the common case: the context holds functions (a `queryFn` inside the options), so it is never sent to the client during SSR, and it is recomputed in the browser during hydration from `params`. Because it is cached per match, the options object stays the same across renders and across `router.invalidate()` calls.

### Execution order

The router runs `context` and `beforeLoad` serially, one route after the other, parent first: for the first match it runs `context`, then `beforeLoad`; then for the second match `context`, then `beforeLoad`; and so on down to the leaf. Loaders start after that serial phase, with the accumulated context.

That order determines what each function sees:

- A route's `context` sees the parent's complete context: the router context plus every ancestor's `context` result and `beforeLoad` result.
- A route's `beforeLoad` sees the parent context plus the route's own `context` result.
- A route's `loader` sees all of that plus the route's own `beforeLoad` result.

### What `context` receives

`context` receives one object with these properties:

- `context` - The parent's effective context as described above.
- `params` - The route's path params.
- `deps` - The result of this route's `loaderDeps`. A route without `loaderDeps` gets an empty string (`''`).
- `location` - The current location.
- `cause` - `'enter'`, `'stay'` or `'preload'`.
- `preload` - `true` while the route is being preloaded.
- `abortController` - The controller of this load.
- `matches` - The matches of this load.
- `routeId` - This route's id.
- `serverContext` - In a TanStack Start app, the request's server context from the route's server middleware, as `beforeLoad` and `loader` receive it; `undefined` on the client.
- `buildLocation`, and the deprecated `navigate`.

`search` is not among them, on purpose: `context` is memoized per match, and a match is keyed by its params and its `loaderDeps`, so a context that read search params outside `loaderDeps` would keep a stale value when those params change. Return the search params you need from `loaderDeps` and read `deps`.

`context` may be async. The route is pending while it resolves and the awaited value is merged.

A `context` handler can return or throw `redirect()` to redirect before `beforeLoad` or loaders run. Redirects are not merged into context or passed to `dehydrate`. Use `throw notFound()` to show a not-found page. Because a successful context result is cached, use `beforeLoad` for checks that must run on every load.

### Cached per match

`context` runs once per match and the result is reused on every later load of that match. `beforeLoad` runs on every load. A different match (other `params` or other `loaderDeps`) computes its own context. A preload shares its context once it has resolved: when a navigation to the match starts while the preload's async `context` is still running, the navigation runs `context` again.

### `revalidate` and `router.invalidate()`

By default `router.invalidate()` reloads the loaders and re-runs `beforeLoad`, but leaves a cached `context` alone. The reason is identity: `useRouteContext` hands components the match's context object itself. If every `invalidate()` rebuilt the context, consumers would get new objects (new `queryOptions`, for example), every component reading the context would re-render, and effect and memo dependencies keyed on those objects would fire again.

A route opts in with `revalidate` in the object form:

- `revalidate: true` runs `handler` again on `router.invalidate()`.
- `revalidate: fn` runs that function instead. It receives the same options as `handler` plus `prev`, the current context data (the last successful `handler`, `hydrate` or `revalidate` result, or `undefined` if none has succeeded for this match yet), and returns the handler's shape or a `redirect()`. Use it to refresh part of the context and keep the rest stable.

There is no time-based revalidation of context. Freshness of data belongs to the data layer (a query's own `staleTime`); the router owns structural caching and explicit invalidation.

An auth lookup that must not run on every client navigation:

```tsx
// src/routes/_authed.tsx
export const Route = createFileRoute('/_authed')({
  context: {
    handler: async ({ context }) => ({
      session: await context.auth.getSession(),
    }),
    dehydrate: true, // SSR: send the result to the client instead of recomputing it there
    revalidate: true, // re-run on router.invalidate() (login/logout)
  },
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: '/login' })
  },
})
```

Call `router.invalidate()` after logout, and after login too. A layout that also has a `loader` keeps its revalidated context even when that load redirects away (here to `/login`). Without `router.invalidate()` after login, the next visit would reuse the logged-out context.

Refreshing one part of the context and keeping the rest stable:

```tsx
// src/routes/account.tsx
export const Route = createFileRoute('/account')({
  context: {
    handler: async () => ({
      accountQueryOptions: accountQueryOptions(),
      authStatus: await getAuthStatus(),
    }),
    dehydrate: false, // SSR: holds query options, so the client runs it again
    revalidate: async ({ prev }) => ({
      accountQueryOptions: prev?.accountQueryOptions ?? accountQueryOptions(),
      authStatus: await getAuthStatus(),
    }),
  },
})
```

### Sending context to the client

During SSR a route's `context` result is not sent to the client by default; the client computes it again during hydration. `dehydrate: true` in the object form sends it, as in the auth example above, and a `dehydrate`/`hydrate` pair sends a custom wire value. These keys are described in [What crosses the wire](./ssr.md#what-crosses-the-wire) and, for TanStack Start, in [SSR Data Transport](/start/latest/docs/framework/react/guide/ssr-data-transport). The full option reference is in [RouteOptions](../api/router/RouteOptionsType.md#context-method).

## Processing Accumulated Route Context

Context, especially the isolated route `context` objects, make it trivial to accumulate and process the route context objects for all matched routes. Here's an example where we use all of the matched route contexts to generate a breadcrumb trail:

```tsx title="src/routes/__root.tsx"
export const Route = createRootRoute({
  component: () => {
    const matches = useRouterState({ select: (s) => s.matches })

    const breadcrumbs = matches
      .filter((match) => match.context.getTitle)
      .map(({ pathname, context }) => {
        return {
          title: context.getTitle(),
          path: pathname,
        }
      })

    // ...
  },
})
```

Using that same route context, we could also generate a title tag for our page's `<head>`:

```tsx title="src/routes/__root.tsx"
export const Route = createRootRoute({
  component: () => {
    const matches = useRouterState({ select: (s) => s.matches })

    const matchWithTitle = [...matches]
      .reverse()
      .find((d) => d.context.getTitle)

    const title = matchWithTitle?.context.getTitle() || 'My App'

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
