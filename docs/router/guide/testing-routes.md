---
id: testing-routes
title: Testing Routes
---

> **Experimental:** The route testing utilities are experimental and subject to change. They are available for React, Solid and Vue.

The `testing` subpath of each framework package (`@tanstack/react-router/testing`, `@tanstack/solid-router/testing`, `@tanstack/vue-router/testing`) creates routers for tests from your app's route tree. The examples on this page use React; [Solid and Vue](#solid-and-vue) lists what differs.

Tests address routes by their id, and everything a test passes is typed from the tree: the start location, params, search params, context, loader data, and the parts of a route it replaces. Tests never declare routes of their own.

Each has the same two functions. Both return a router that you render with `RouterProvider`, so they work with any test library:

| Function                   | Use it to test                                                           | What runs                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `createTestRouter`         | A route or a flow: redirects, loaders, layouts, errors, navigation       | Your routes' `context`, `beforeLoad` and `loader`, unless the test replaces them                          |
| `createIsolatedTestRouter` | A component that reads route state: params, search, context, loader data | None of them. The test supplies the state the component reads, and the TypeScript types require all of it |

## Setup

Both functions take your route tree. With file-based routing, import the generated `routeTree.gen.ts`, and keep the router plugin in the Vite config your tests use, so the file is regenerated when a test run starts:

```ts title="vite.config.ts"
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
  ],
  test: {
    environment: 'jsdom',
    // Type-check the tests, so that a test that leaves out route state fails.
    typecheck: { enabled: true },
  },
})
```

For Solid or Vue, pass `target: 'solid'` or `target: 'vue'`, and use your framework's Vite plugin. With code-based routing, pass the route tree you build with `addChildren`.

## The example app

The examples on this page use this app, which also has a `/login` route:

```tsx title="src/routes/__root.tsx"
export const Route = createRootRouteWithContext<{ locale: string }>()({
  beforeLoad: async () => ({ session: await fetchSession() }),
  component: RootLayout,
})
```

```tsx title="src/routes/_authed.tsx"
export const Route = createFileRoute('/_authed')({
  beforeLoad: ({ context }) => {
    if (!context.session.user) {
      throw redirect({ to: '/login' })
    }
    return { user: context.session.user }
  },
  loader: async () => ({ unreadCount: await fetchUnreadCount() }),
  component: AuthedLayout,
})
```

```tsx title="src/routes/_authed/posts.$postId.tsx"
export const Route = createFileRoute('/_authed/posts/$postId')({
  loader: async ({ params }) => ({ post: await fetchPost(params.postId) }),
  component: PostPage,
})
```

```tsx title="src/components/PostHeader.tsx"
const postRoute = getRouteApi('/_authed/posts/$postId')

export function PostHeader() {
  const { post } = postRoute.useLoaderData()
  const { user } = postRoute.useRouteContext()

  return (
    <header>
      <h1>{post.title}</h1>
      {post.authorId === user.id ? <span>Written by you</span> : null}
    </header>
  )
}
```

## Test a route with `createTestRouter`

`createTestRouter` takes the options of `createRouter`, plus `location` and `overrides`. It creates a router over a copy of your route tree, and every route behaves as in the app unless the test replaces part of it:

```tsx title="tests/post-route.test.tsx"
import { render, screen } from '@testing-library/react'
import { RouterProvider, rootRouteId } from '@tanstack/react-router'
import { createTestRouter } from '@tanstack/react-router/testing'
import { expect, test } from 'vitest'
import { routeTree } from '../src/routeTree.gen'

test('sends a signed-out visitor to the login page', async () => {
  const router = createTestRouter({
    routeTree,
    context: { locale: 'en' },
    location: { to: '/posts/$postId', params: { postId: '1' } },
    overrides: {
      // The root route's beforeLoad does not run. This is its result.
      [rootRouteId]: { routeContext: { session: { user: null } } },
    },
  })
  render(<RouterProvider router={router} />)

  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
  expect(router.state.location.pathname).toBe('/login')
})
```

The test does not replace the `beforeLoad` of `/_authed`, so it runs, finds no user and redirects.

- `location` is typed like the options of `navigate`: `to` must be a path of your app, and the path params and search params that path requires are required here too. It replaces the current entry of the router's history. Without it, the router starts at the current location of its history: `/` for the default memory history.
- The router uses a memory history, unless you pass your own `history`.
- `context` and every other option go to the router as in `createRouter`.
- The router has not loaded yet. Render it with `RouterProvider`, or `await router.load()` to assert on `router.state` without rendering anything.
- Every call builds a new copy of the route tree. Overrides never reach another test, and the route objects your app imports keep their options.

### Replace parts of a route

`overrides` takes overrides by route id. For the root route, use the `rootRouteId` that `@tanstack/react-router` exports, as a computed key: `[rootRouteId]`. Each override is typed from the route it replaces:

| Override                                                               | Effect                                                                                                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `beforeLoad`, `loader`, `context`                                      | Replace the route option of the same name. Each takes a function that receives what the original receives and has to return what the original returns. |
| `loaderData`                                                           | A seed: the route's loader is replaced by one that returns this value.                                                                                 |
| `routeContext`                                                         | A seed: everything the route adds to the context. Neither the route's `context` option nor its `beforeLoad` runs.                                      |
| `component`, `pendingComponent`, `errorComponent`, `notFoundComponent` | Replace what the route renders. An override also wins over the options of a [lazy route](./code-splitting.md) once they have loaded.                   |

Setting an option to `undefined` removes it. A route cannot take both `loader` and `loaderData`, or `routeContext` together with `context` or `beforeLoad`. The options that derive state from the URL cannot be replaced, because replacing them would change the route's types: `params.parse` and `params.stringify`, `validateSearch`, the `search` middlewares and `loaderDeps` run as in the app.

```tsx
const router = createTestRouter({
  routeTree,
  context: { locale: 'en' },
  location: { to: '/posts/$postId', params: { postId: '7' } },
  overrides: {
    [rootRouteId]: { routeContext: { session: { user: ada } } },
    '/_authed': { loaderData: { unreadCount: 3 } },
    '/_authed/posts/$postId': {
      loader: ({ params }) => ({ post: createPost({ id: params.postId }) }),
    },
  },
})
```

Here the real `beforeLoad` of `/_authed` derives `user` from the seeded session. A loader that returns the wrong data, or an override for a route id that does not exist, is a type error.

To reuse overrides in several tests, check them against `RouteTestOverrides` and spread them:

```tsx title="tests/fixtures.ts"
import { rootRouteId } from '@tanstack/react-router'
import type { RouteTestOverrides } from '@tanstack/react-router/testing'
import type { routeTree } from '../src/routeTree.gen'

export const signedIn = {
  [rootRouteId]: { routeContext: { session: { user: ada } } },
} satisfies RouteTestOverrides<typeof routeTree>
```

```tsx
overrides: { ...signedIn, '/_authed': { loaderData: { unreadCount: 3 } } },
```

## Test a component with `createIsolatedTestRouter`

`createIsolatedTestRouter` creates a router that renders one element inside one route. The test supplies the state the route would have in the app:

```tsx title="tests/post-header.test.tsx"
import { render, screen } from '@testing-library/react'
import { RouterProvider } from '@tanstack/react-router'
import { createIsolatedTestRouter } from '@tanstack/react-router/testing'
import { expect, test } from 'vitest'
import { PostHeader } from '../src/components/PostHeader'
import { routeTree } from '../src/routeTree.gen'

test('marks posts written by the signed-in user', async () => {
  const router = await createIsolatedTestRouter({
    routeTree,
    route: '/_authed/posts/$postId',
    element: <PostHeader />,
    params: { postId: '1' },
    context: { locale: 'en', session: { user: ada }, user: ada },
    loaderData: {
      '/_authed': { unreadCount: 0 },
      '/_authed/posts/$postId': { post: createPost({ authorId: ada.id }) },
    },
  })
  render(<RouterProvider router={router} />)

  expect(screen.getByText('Written by you')).toBeTruthy()
})
```

`element` renders in place of the route's component. No `context`, `beforeLoad` or `loader` option of any route runs, none of your route components render, and lazy routes are not loaded, so nothing of the app runs around the element. The function resolves once the router has loaded, so the first render is complete.

The router is real: links get their real `href`, and navigation updates `router.state`, but every route other than the one under test renders nothing.

### What the types require

The options are typed from the route that `route` names. They ask for what the skipped options would have produced:

| Option       | Contains                                                                                                                                   | Required when                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `params`     | All path params of the route                                                                                                               | The route has path params                                              |
| `search`     | The search params, as a link to the route takes them. They go through the route's `validateSearch`.                                        | The route requires search params                                       |
| `context`    | The route's whole context: the router context and everything each route above it adds. It is what `useRouteContext` returns for the route. | The context has values                                                 |
| `loaderData` | Loader data by route id, for the route and the routes above it                                                                             | One of these routes has a loader that returns data. It needs an entry. |

In the example, `context` has to hold `locale` from the router context, `session` from the root route and `user` from `/_authed`, and `loaderData` has to hold the data of `/_authed` and of the post route. Leaving any of them out is a type error that names the missing value. For the root route, use `route: rootRouteId`, and `[rootRouteId]` as its key in `loaderData`.

> [!NOTE]
> Vitest checks these types only when [type checking](https://vitest.dev/guide/testing-types) is on: set `test.typecheck.enabled` as in the [setup](#setup), or run `vitest --typecheck`. Vitest then runs `tsc` with your `tsconfig.json`, and a type error in a test file that the tsconfig includes fails the run, with its file and line. By default Vitest lists such an error as a source error; add your test files to `typecheck.include` to have it reported as a failure of the test that contains it. Without type checking, Vitest only strips the types: a test that leaves state out still runs, and the component reads `undefined`.

At run time, `createIsolatedTestRouter` rejects with a message when:

- `route` is not a route of the tree,
- a path param is missing,
- a route on the way to `route` fails to load, for example because its `validateSearch` rejects the search params,
- the location of the route does not lead to it. A pathless layout route has no location of its own: render the element in one of its child routes, and read the layout's state with `getRouteApi('/_layout')`.

## Share state across tests

There is no configuration step. Share state the way you share any test data, and spread it into each call; the types check the object that a test ends up passing:

```tsx title="tests/fixtures.ts"
export const signedInContext = {
  locale: 'en',
  session: { user: ada },
  user: ada,
}
```

```tsx
const router = await createIsolatedTestRouter({
  routeTree,
  route: '/_authed/posts/$postId',
  element: <PostHeader />,
  params: { postId: '1' },
  context: { ...signedInContext, user: grace },
  loaderData: {
    '/_authed': { unreadCount: 0 },
    '/_authed/posts/$postId': { post: createPost() },
  },
})
```

## Router options

Both functions pass their other options to the router, for example `Wrap` for the providers your components need:

```tsx
const router = createTestRouter({
  routeTree,
  context: { locale: 'en' },
  Wrap: ({ children }) => (
    <ThemeProvider theme="light">{children}</ThemeProvider>
  ),
})
```

`createIsolatedTestRouter` leaves out `defaultComponent`, `defaultPendingComponent`, `defaultErrorComponent` and `defaultNotFoundComponent`, and turns off the router's global error boundary, so the router does not catch an error that the element throws. It creates its own history and sets its location from `route`, `params` and `search`; its `search` is the route's search params, not the router option of that name.

## Solid and Vue

`@tanstack/solid-router/testing` and `@tanstack/vue-router/testing` have the same two functions with the same options. Only the element under test and the call that renders the router differ:

| Framework | `element`                                                      | Render the router                                                                  |
| --------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| React     | `<PostHeader />`                                               | `render(<RouterProvider router={router} />)` from `@testing-library/react`         |
| Solid     | `() => <PostHeader />`, because Solid evaluates JSX right away | `render(() => <RouterProvider router={router} />)` from `@solidjs/testing-library` |
| Vue       | A vnode: `<PostHeader />` with Vue JSX, or `h(PostHeader)`     | `render(<RouterProvider router={router} />)` from `@testing-library/vue`           |

```tsx title="tests/post-header.test.tsx (Solid)"
import { render, screen } from '@solidjs/testing-library'
import { RouterProvider } from '@tanstack/solid-router'
import { createIsolatedTestRouter } from '@tanstack/solid-router/testing'

const router = await createIsolatedTestRouter({
  routeTree,
  route: '/_authed/posts/$postId',
  element: () => <PostHeader />,
  params: { postId: '1' },
  context: { locale: 'en', session: { user: ada }, user: ada },
  loaderData: {
    '/_authed': { unreadCount: 0 },
    '/_authed/posts/$postId': { post: createPost({ authorId: ada.id }) },
  },
})
render(() => <RouterProvider router={router} />)
```

In Vue, `Wrap` is a component that renders its default slot.

## Limitations

- Every test router loads your whole route tree, so every route module is imported, with its top-level code and its imports.
- The utilities are tested with Vitest in jsdom only.
- TanStack Start apps are not supported yet. Importing the route tree in a test also imports the server-only code of your route files.

## API

See the [`createTestRouter`](../api/router/createTestRouterFunction.md) and [`createIsolatedTestRouter`](../api/router/createIsolatedTestRouterFunction.md) references.
