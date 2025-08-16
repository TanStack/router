import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
  redirect,
  useRouterState,
} from '../src'

afterEach(() => {
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

function setup({
  beforeLoad,
  loader,
  head,
  headers,
  scripts,
  defaultPendingMs,
  defaultPendingMinMs,
}: {
  beforeLoad?: () => any
  loader?: () => any
  head?: () => any
  headers?: () => any
  scripts?: () => any
  defaultPendingMs?: number
  defaultPendingMinMs?: number
}) {
  const select = vi.fn()

  const rootRoute = createRootRoute({
    component: function RootComponent() {
      useRouterState({ select })
      return <Outlet />
    },
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <>
        <h1>Index</h1>
        <Link to="/posts">Posts</Link>
      </>
    ),
  })

  const postsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/posts',
    beforeLoad,
    loader,
    head,
    headers,
    scripts,
    component: () => <h1>Posts Title</h1>,
  })

  const otherRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/other',
    component: () => <h1>Other Title</h1>,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, postsRoute, otherRoute]),
    defaultPendingMs,
    defaultPendingMinMs,
    defaultPendingComponent: () => <p>Loading...</p>,
    defaultNotFoundComponent: () => <h1>Not Found Title</h1>,
    defaultPreload: 'intent',
  })

  render(<RouterProvider router={router} />)

  return { select, router }
}

async function run({ select }: ReturnType<typeof setup>) {
  // navigate to /posts
  const link = await waitFor(() => screen.getByRole('link', { name: 'Posts' }))
  const before = select.mock.calls.length
  fireEvent.click(link)
  const title = await waitFor(
    () => screen.getByRole('heading', { name: /Title$/ }), // matches /posts and /other and not found
  )
  expect(title).toBeInTheDocument()
  const after = select.mock.calls.length

  return after - before
}

function resolveAfter(ms: number, value: any) {
  return new Promise<void>((resolve) => setTimeout(() => resolve(value), ms))
}

describe("Store doesn't update *too many* times during navigation", () => {
  test('async loader, async beforeLoad, pendingMs', async () => {
    const params = setup({
      beforeLoad: () => resolveAfter(100, { foo: 'bar' }),
      loader: () => resolveAfter(100, { hello: 'world' }),
      defaultPendingMs: 100,
      defaultPendingMinMs: 300,
    })

    const updates = await run(params)

    // This number should be as small as possible to minimize the amount of work
    // that needs to be done during a navigation.
    // Any change that increases this number should be investigated.
    expect(updates).toBe(10)
  })

  test('redirection in preload', async () => {
    const { select, router } = setup({
      loader: () => {
        throw redirect({ to: '/other' })
      },
    })

    const before = select.mock.calls.length
    await router.preloadRoute({ to: '/posts' })
    const after = select.mock.calls.length
    const updates = after - before

    // This number should be as small as possible to minimize the amount of work
    // that needs to be done during a navigation.
    // Any change that increases this number should be investigated.
    expect(updates).toBe(5)
  })

  test('sync beforeLoad', async () => {
    const params = setup({
      beforeLoad: () => ({ foo: 'bar' }),
      loader: () => resolveAfter(100, { hello: 'world' }),
      defaultPendingMs: 100,
      defaultPendingMinMs: 300,
    })

    const updates = await run(params)

    // This number should be as small as possible to minimize the amount of work
    // that needs to be done during a navigation.
    // Any change that increases this number should be investigated.
    expect(updates).toBe(9)
  })

  test('nothing', async () => {
    const params = setup({})

    const updates = await run(params)

    // This number should be as small as possible to minimize the amount of work
    // that needs to be done during a navigation.
    // Any change that increases this number should be investigated.
    expect(updates).toBeGreaterThanOrEqual(6) // WARN: this is flaky, and sometimes (rarely) is 7
    expect(updates).toBeLessThanOrEqual(7)
  })

  test('not found in beforeLoad', async () => {
    const params = setup({
      beforeLoad: () => {
        throw notFound()
      },
    })

    const updates = await run(params)

    // This number should be as small as possible to minimize the amount of work
    // that needs to be done during a navigation.
    // Any change that increases this number should be investigated.
    expect(updates).toBe(7)
  })

  test('hover preload, then navigate, w/ async loaders', async () => {
    const { select } = setup({
      beforeLoad: () => Promise.resolve({ foo: 'bar' }),
      loader: () => Promise.resolve({ hello: 'world' }),
    })

    const link = await waitFor(() =>
      screen.getByRole('link', { name: 'Posts' }),
    )
    const before = select.mock.calls.length
    fireEvent.focus(link)
    fireEvent.click(link)
    const title = await waitFor(() =>
      screen.getByRole('heading', { name: /Title$/ }),
    )
    expect(title).toBeInTheDocument()
    const after = select.mock.calls.length
    const updates = after - before

    // This number should be as small as possible to minimize the amount of work
    // that needs to be done during a navigation.
    // Any change that increases this number should be investigated.
    expect(updates).toBe(15)
  })
})
