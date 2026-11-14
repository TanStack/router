---
id: testing-routes
title: Testing Routes
---

> **Experimental:** The route testing utilities are experimental and subject to change. They are available for React only.

`@tanstack/react-router/testing` builds test routers from your app's route tree. Tests address routes by their id, and everything a test passes is typed from the tree: the start location, params, search params, context, loader data, and the parts of a route it replaces. Tests never declare routes of their own.

It has two helpers:

| Helper             | Use it to test                                                       | What runs                                                                                              |
| ------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `createTestRouter` | A route or a flow: redirects, loaders, layouts, errors, navigation   | Your routes' `context`, `beforeLoad` and `loader`, unless the test replaces them                       |
| `renderInRoute`    | A component that reads route state: params, search, context, loaders | None of them. The test supplies the state the component reads, and the TypeScript types require it all |

## Setup

Both helpers take your route tree. With file-based routing, import the generated `routeTree.gen.ts`, and keep the router plugin in the Vite config your tests use, so the file is regenerated when a test run starts:

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
  },
})
```

With code-based routing, pass the route tree you build with `addChildren`.

Create the helpers once, in a file your tests import:

```tsx title="src/test-utils.tsx"
import { render } from '@testing-library/react'
import { createRouterTesting } from '@tanstack/react-router/testing'
import { routeTree } from './routeTree.gen'

export const { createTestRouter, renderInRoute } = createRouterTesting({
  routeTree,
  render,
})
```

`render` is the function your test library uses to mount a React element. Only `renderInRoute` calls it; TanStack Router does not depend on a test library.

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

`createTestRouter` creates a router over a copy of your route tree. Every route behaves as in the app unless the test replaces part of it:

```tsx title="tests/post-route.test.tsx"
import { render, screen } from '@testing-library/react'
import { RouterProvider } from '@tanstack/react-router'
import { expect, test } from 'vitest'
import { createTestRouter } from '../src/test-utils'

test('sends a signed-out visitor to the login page', async () => {
  const router = createTestRouter({
    location: { to: '/posts/$postId', params: { postId: '1' } },
    context: { locale: 'en' },
    routes: {
      // The root route's beforeLoad does not run. This is its result.
      __root__: { context: { session: { user: null } } },
    },
  })
  render(<RouterProvider router={router} />)

  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
  expect(router.state.location.pathname).toBe('/login')
})
```

The test does not replace the `beforeLoad` of `/_authed`, so it runs, finds no user and redirects.

- `location` is typed like the options of `navigate`: `to` must be a path of your app, and the path params and search params that path requires are required here too. Without `location`, the router starts at `/`. To start from history entries that are not valid navigation targets, pass `history: createMemoryHistory({ initialEntries: [...] })` instead.
- `context` is the router context, typed from your root route.
- The router has not loaded yet. Render it with `RouterProvider`, or `await router.load()` to assert on `router.state` without rendering anything.
- Every call builds a new copy of the route tree. Overrides never reach another test, and the route objects your app imports keep their options.

### Replace parts of a route

`routes` takes overrides by route id. Each override is typed from the route it replaces:

| Override                                                               | Effect                                                                                                                               |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `beforeLoad: fn`                                                       | Replaces the route's `beforeLoad`. `fn` receives what the original receives and has to return what the original returns.             |
| `loader: fn`                                                           | Replaces the route's loader. `fn` receives what the original receives and has to return the route's loader data.                     |
| `context: fn`                                                          | Replaces the route's `context` option.                                                                                               |
| `context: value`                                                       | A seed: `value` is everything the route adds to the context. Neither the route's `context` option nor its `beforeLoad` runs.         |
| `loaderData: value`                                                    | A seed: the route's loader is replaced by one that returns `value`.                                                                  |
| `component`, `pendingComponent`, `errorComponent`, `notFoundComponent` | Replace what the route renders. An override also wins over the options of a [lazy route](./code-splitting.md) once they have loaded. |

Setting an option to `undefined` removes it, and a route cannot take both `loader` and `loaderData`. The options that derive state from the URL cannot be replaced, because replacing them would change the route's types: `params.parse` and `params.stringify`, `validateSearch`, the `search` middlewares and `loaderDeps` run as in the app.

```tsx
const router = createTestRouter({
  location: { to: '/posts/$postId', params: { postId: '7' } },
  context: { locale: 'en' },
  routes: {
    __root__: { context: { session: { user: ada } } },
    '/_authed': { loaderData: { unreadCount: 3 } },
    '/_authed/posts/$postId': {
      loader: ({ params }) => ({ post: createPost({ id: params.postId }) }),
    },
  },
})
```

Here the real `beforeLoad` of `/_authed` derives `user` from the seeded session. A loader that returns the wrong data, or an override for a route id that does not exist, is a type error.

To reuse overrides in several tests, check them against `RouteTestOverrides`:

```tsx
import type { RouteTestOverrides } from '@tanstack/react-router/testing'
import type { routeTree } from '../src/routeTree.gen'

export const signedIn = {
  __root__: { context: { session: { user: ada } } },
} satisfies RouteTestOverrides<typeof routeTree>
```

## Test a component with `renderInRoute`

`renderInRoute` renders one element inside one route. The test supplies the state the route would have in the app:

```tsx title="tests/post-header.test.tsx"
import { screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { PostHeader } from '../src/components/PostHeader'
import { renderInRoute } from '../src/test-utils'

test('marks posts written by the signed-in user', async () => {
  await renderInRoute(<PostHeader />, {
    route: '/_authed/posts/$postId',
    params: { postId: '1' },
    context: { locale: 'en', session: { user: ada }, user: ada },
    loaderData: { post: createPost({ authorId: ada.id }) },
    routes: { '/_authed': { loaderData: { unreadCount: 0 } } },
  })

  expect(screen.getByText('Written by you')).toBeTruthy()
})
```

No `context`, `beforeLoad` or `loader` option of any route runs, none of your route components render, and lazy routes are not loaded. Nothing of the app runs around the element. The router has loaded before the element renders, so the first render is complete when `renderInRoute` resolves.

`renderInRoute` resolves to `{ router, result }`. `router` is a real router: links get their real `href`, and navigation updates `router.state`, but every route other than the one under test renders nothing. `result` is what your `render` function returned.

### What the types require

The options are typed from the route that `route` names. They ask for what the skipped options would have produced:

| Option       | Contains                                                                                                                                   | Required when                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `params`     | All path params of the route                                                                                                               | The route has path params                          |
| `search`     | The search params, as a link to the route takes them. They go through the route's `validateSearch`.                                        | The route requires search params                   |
| `context`    | The route's whole context: the router context and everything each route above it adds. It is what `useRouteContext` returns for the route. | The context has values                             |
| `loaderData` | The route's loader data                                                                                                                    | The route's loader returns data                    |
| `routes`     | `{ [routeId]: { loaderData } }` for the routes above it                                                                                    | One of those routes has a loader that returns data |

In the example, `context` has to hold `locale` from the router context, `session` from the root route and `user` from `/_authed`, and `routes` has to hold the loader data of `/_authed`. Leaving any of them out is a type error that names the missing value.

> [!NOTE]
> Type errors appear in your editor and when you type-check your tests, for example with `tsc --noEmit`. `vitest run` strips types without checking them: a test that leaves state out still runs, and the component reads `undefined`. Type-check your test files in CI.

At run time, `renderInRoute` fails with a message when:

- `route` is not a route of the tree,
- a path param is missing,
- a route on the way to `route` fails to load, for example because its `validateSearch` rejects the search params,
- the location of the route does not lead to it. A pathless layout route has no location of its own: render the element in one of its child routes, and read the layout's state with `getRouteApi('/_layout')`.

## Share values across tests

Put values that many tests share into `defaults`. What the defaults provide becomes optional in each test:

```tsx title="src/test-utils.tsx"
export const { createTestRouter, renderInRoute } = createRouterTesting({
  routeTree,
  render,
  defaults: {
    context: { locale: 'en', session: { user: ada }, user: ada },
    routes: { '/_authed': { loaderData: { unreadCount: 0 } } },
  },
})
```

```tsx
await renderInRoute(<PostHeader />, {
  route: '/_authed/posts/$postId',
  params: { postId: '1' },
  loaderData: { post: createPost() },
})
```

- `defaults.context` is added to the router context of every test router, and is the base of the route's context in `renderInRoute`. A test's own `context` wins, key by key. In `createTestRouter` it does not stop a route's `beforeLoad` from running; seed the route in `defaults.routes` for that.
- `defaults.routes` applies to every router that `createTestRouter` creates, and a test's own override for a route wins, option by option. `renderInRoute` uses only the `loaderData` seeds from it.

## Providers and router options

`routerOptions` are passed to every test router, for example `Wrap` for the providers your components need:

```tsx title="src/test-utils.tsx"
export const { createTestRouter, renderInRoute } = createRouterTesting({
  routeTree,
  render,
  routerOptions: {
    Wrap: ({ children }) => (
      <ThemeProvider theme="light">{children}</ThemeProvider>
    ),
  },
})
```

`renderInRoute` keeps them, except `defaultComponent`, `defaultPendingComponent` and `defaultErrorComponent`. It also turns off the router's global error boundary, so an error the element throws reaches the test.

## Limitations

- Only React is supported.
- Every test router loads your whole route tree, so every route module is imported, with its top-level code and its imports.
- The utilities are tested with Vitest in jsdom only.
- TanStack Start apps are not supported yet. Importing the route tree in a test also imports the server-only code of your route files.

## API

See the [`createRouterTesting` reference](../api/router/createRouterTestingFunction.md).
