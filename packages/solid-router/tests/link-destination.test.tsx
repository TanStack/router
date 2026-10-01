import { createSignal } from 'solid-js'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  retainSearchParams,
} from '../src'

declare module '@tanstack/history' {
  interface HistoryState {
    destinationTag?: string
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

test('caches fixed destinations across navigation and rebuilds inherited destinations and changed props', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  const [hash, setHash] = createSignal('first')
  const rewriteTarget = vi.fn()
  const root = createRootRoute({
    component: () => (
      <>
        <Link to="/target" hash={hash()} data-testid="fixed-link">
          Target
        </Link>
        <Link to="." search={true} hash={true} data-testid="inherited-link">
          Inherited
        </Link>
        <Outlet />
      </>
    ),
  })
  const source = createRoute({
    getParentRoute: () => root,
    path: '/source/$id',
  })
  const target = createRoute({ getParentRoute: () => root, path: '/target' })
  const router = createRouter({
    routeTree: root.addChildren([source, target]),
    history: createMemoryHistory({ initialEntries: ['/source/one?q=one#one'] }),
    rewrite: {
      output: ({ url }) => {
        if (url.pathname === '/target') {
          rewriteTarget()
        }
        return url
      },
    },
  })
  await router.load()
  const view = render(() => <RouterProvider router={router} />)
  const fixed = await view.findByTestId('fixed-link')
  const inherited = await view.findByTestId('inherited-link')
  expect(fixed).toHaveAttribute('href', '/target#first')
  expect(inherited).toHaveAttribute('href', '/source/one?q=one#one')
  rewriteTarget.mockClear()
  await router.navigate({
    to: '/source/$id',
    params: { id: 'two' },
    search: { q: 'two' },
    hash: 'two',
  })
  expect(fixed).toHaveAttribute('href', '/target#first')
  expect(inherited).toHaveAttribute('href', '/source/two?q=two#two')
  expect(rewriteTarget).not.toHaveBeenCalled()
  setHash('second')
  expect(fixed).toHaveAttribute('href', '/target#second')
  expect(rewriteTarget).toHaveBeenCalled()
})

test.each([false, true])(
  'updates inherited masks for a fixed destination (automatic: %s)',
  async (automatic) => {
    const root = createRootRoute({
      component: () => (
        <>
          <Link
            to="/target"
            mask={
              automatic
                ? undefined
                : { to: '/source/$id', params: true, search: true, hash: true }
            }
            data-testid="mask-link"
          >
            Target
          </Link>
          <Outlet />
        </>
      ),
    })
    const source = createRoute({
      getParentRoute: () => root,
      path: '/source/$id',
    })
    const target = createRoute({ getParentRoute: () => root, path: '/target' })
    const routeTree = root.addChildren([source, target])
    const router = createRouter({
      routeTree,
      routeMasks: automatic
        ? [
            {
              routeTree,
              from: '/target',
              to: '/source/$id',
              params: true,
              search: true,
              hash: true,
            },
          ]
        : undefined,
      history: createMemoryHistory({
        initialEntries: ['/source/one?q=one#one'],
      }),
    })
    await router.load()
    const view = render(() => <RouterProvider router={router} />)
    const link = await view.findByTestId('mask-link')
    expect(link).toHaveAttribute('href', '/source/one?q=one#one')
    await router.navigate({
      to: '/source/$id',
      params: { id: 'two' },
      search: { q: 'two' },
      hash: 'two',
      state: { destinationTag: 'latest' },
    })
    expect(link).toHaveAttribute('href', '/source/two?q=two#two')
  },
)

test('updates inherited state after a navigation with the same href', async () => {
  let sourceTag: string | undefined
  const root = createRootRoute({
    component: () => (
      <>
        <Link
          to="/target"
          state={(previous) => {
            sourceTag = previous.destinationTag
            return previous
          }}
          data-testid="state-link"
        >
          Target
        </Link>
        <Outlet />
      </>
    ),
  })
  const source = createRoute({
    getParentRoute: () => root,
    path: '/source/$id',
  })
  const target = createRoute({ getParentRoute: () => root, path: '/target' })
  const router = createRouter({
    routeTree: root.addChildren([source, target]),
    history: createMemoryHistory({ initialEntries: ['/source/one?q=one#one'] }),
  })
  await router.load()
  const view = render(() => <RouterProvider router={router} />)
  const link = await view.findByTestId('state-link')
  expect(link).toHaveAttribute('href', '/target')
  await router.navigate({
    to: '/source/$id',
    params: { id: 'one' },
    search: { q: 'one' },
    hash: 'one',
    state: { destinationTag: 'latest' },
  })
  expect(sourceTag).toBe('latest')
  fireEvent.click(link)
  await waitFor(() => {
    expect(router.state.location.pathname).toBe('/target')
    expect(router.state.location.state.destinationTag).toBe('latest')
  })
})

test('invalidates fixed destinations after router and route-tree updates with an explicit source', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  const root = createRootRoute({
    component: () => (
      <>
        <Link to="/target" _fromLocation={sourceLocation}>
          Target
        </Link>
        <Outlet />
      </>
    ),
  })
  const source = createRoute({ getParentRoute: () => root, path: '/source' })
  const target = createRoute({ getParentRoute: () => root, path: '/target' })
  const routeTree = root.addChildren([source, target])
  const router = createRouter<typeof routeTree, 'always' | 'never'>({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/source?retained=value'],
    }),
  })
  await router.load()
  const sourceLocation: ReturnType<
    ReturnType<typeof createRouter>['buildLocation']
  > = router.state.location
  const view = render(() => <RouterProvider router={router} />)
  const link = await view.findByText('Target')
  expect(link).toHaveAttribute('href', '/target')
  router.update({ trailingSlash: 'always' })
  await router.navigate({ to: '/source', search: { retained: 'other' } })
  expect(link).toHaveAttribute('href', '/target/')
  root.update({ search: { middlewares: [retainSearchParams(true)] } })
  router.setRoutes(router.buildRouteTree())
  await router.navigate({ to: '/source', search: { retained: 'third' } })
  expect(link).toHaveAttribute('href', '/target/?retained=value')
})
