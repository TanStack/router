import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@solidjs/testing-library'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(cleanup)

test.each(['click', 'preload'] as const)(
  'departing Link %s resolves from its displayed source',
  async (operation) => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const search = vi.fn((previous) => previous)
    const root = createRootRoute({
      component: Outlet,
      validateSearch: (search) => ({ value: String(search.value ?? '') }),
    })
    const a = createRoute({
      getParentRoute: () => root,
      path: '/a',
      component: () => (
        <Link
          to="/a"
          search={search}
          preload="intent"
          preloadDelay={0}
          data-testid="source"
        />
      ),
    })
    const b = createRoute({
      getParentRoute: () => root,
      path: '/b',
      loader: () => pending,
    })
    const history = createMemoryHistory({ initialEntries: ['/a?value=old'] })
    const router = createRouter({
      routeTree: root.addChildren([a, b]),
      history,
      defaultPendingMs: Infinity,
    })
    render(() => <RouterProvider router={router} />)
    const link = await screen.findByTestId('source')
    let navigation!: Promise<void>
    try {
      navigation = router.navigate({
        to: '/b',
        search: { value: 'new' },
      } as any)
      await waitFor(() => expect(router.state.location.pathname).toBe('/b'))
      expect(link).toHaveAttribute('href', '/a?value=old')
      search.mockClear()
      fireEvent[operation === 'click' ? 'click' : 'mouseEnter'](link)
      await waitFor(() => expect(search).toHaveBeenCalled())
      expect(search).toHaveBeenLastCalledWith({ value: 'old' })
      if (operation === 'click') {
        await waitFor(() => {
          expect(router.state.location.pathname).toBe('/a')
          expect(router.state.location.search.value).toBe('old')
        })
      }
    } finally {
      release()
      await navigation
      history.destroy()
    }
  },
)

test('departing Links retain their published source and catch up on a successor', async () => {
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const leavingSearch = vi.fn((search) => search)
  const stayingSearch = vi.fn((search) => search)
  const root = createRootRoute({
    component: () => (
      <>
        <Link from="/a" to="/a" search={stayingSearch} data-testid="staying" />
        <Outlet />
      </>
    ),
  })
  const a = createRoute({
    getParentRoute: () => root,
    path: '/a',
    component: function A() {
      return (
        <>
          <Link from="/" to="/a" search={leavingSearch} data-testid="leaving" />
        </>
      )
    },
  })
  const b = createRoute({
    getParentRoute: () => root,
    path: '/b',
    loader: () => pending,
  })
  const router = createRouter({
    routeTree: root.addChildren([a, b]),
    history: createMemoryHistory({ initialEntries: ['/a?value=old'] }),
    defaultPendingMs: Infinity,
  })
  render(() => <RouterProvider router={router} />)
  const leaving = await screen.findByTestId('leaving')
  expect(leaving).toHaveAttribute('href', '/a?value=old')
  const before = leavingSearch.mock.calls.length
  const navigation = router.navigate({
    to: '/b',
    search: { value: 'new' },
  } as any)
  await waitFor(() => expect(router.state.location.pathname).toBe('/b'))
  expect(screen.getByTestId('staying')).toHaveAttribute('href', '/a?value=new')
  expect(leavingSearch).toHaveBeenCalledTimes(before)
  expect(leaving).toHaveAttribute('href', '/a?value=old')
  await router.navigate({ to: '/a', search: { value: 'latest' } } as any)
  expect(leaving).toHaveAttribute('href', '/a?value=latest')
  release()
  await navigation
  expect(leaving).toHaveAttribute('href', '/a?value=latest')
  router.history.destroy()
})

test('fixed destinations observe custom history formatting on unrelated navigation', async () => {
  const root = createRootRoute({
    component: () => (
      <>
        <Link to="/target" data-testid="target" />
        <Outlet />
      </>
    ),
  })
  const a = createRoute({ getParentRoute: () => root, path: '/a' })
  const b = createRoute({ getParentRoute: () => root, path: '/b' })
  const target = createRoute({ getParentRoute: () => root, path: '/target' })
  const history = createMemoryHistory({ initialEntries: ['/a'] })
  const router = createRouter({
    routeTree: root.addChildren([a, b, target]),
    history: {
      ...history,
      createHref: (href) => `${href}#${history.location.pathname}`,
    },
  })
  render(() => <RouterProvider router={router} />)
  const link = await screen.findByTestId('target')
  expect(link).toHaveAttribute('href', '/target#/a')
  await router.navigate({ to: '/b' })

  await waitFor(() => expect(link).toHaveAttribute('href', '/target#/b'))
  history.destroy()
})

test('configuration changes invalidate a fixed destination immediately', async () => {
  const root = createRootRoute({
    component: () => (
      <>
        <Link to="/target" data-testid="target" />
        <Outlet />
      </>
    ),
  })
  const a = createRoute({ getParentRoute: () => root, path: '/a' })
  const target = createRoute({ getParentRoute: () => root, path: '/target' })
  const router = createRouter({
    routeTree: root.addChildren([a, target]),
    history: createMemoryHistory({ initialEntries: ['/a'] }),
  })
  render(() => <RouterProvider router={router} />)
  const link = await screen.findByTestId('target')
  expect(link).toHaveAttribute('href', '/target')
  router.update({ trailingSlash: 'always' } as any)

  await waitFor(() => expect(link).toHaveAttribute('href', '/target/'))
  router.history.destroy()
})

test('inherited params invalidate independently of the old activity pathname', async () => {
  const root = createRootRoute({
    component: () => (
      <>
        <Link to="/teams/$teamId/settings" params={true} data-testid="target" />
        <Outlet />
      </>
    ),
  })
  const team = createRoute({
    getParentRoute: () => root,
    path: '/teams/$teamId',
  })
  const dashboard = createRoute({
    getParentRoute: () => team,
    path: 'dashboard',
  })
  const settings = createRoute({ getParentRoute: () => team, path: 'settings' })
  const router = createRouter({
    routeTree: root.addChildren([team.addChildren([dashboard, settings])]),
    history: createMemoryHistory({ initialEntries: ['/teams/a/dashboard'] }),
  })
  render(() => <RouterProvider router={router} />)
  const link = await screen.findByTestId('target')
  expect(link).toHaveAttribute('href', '/teams/a/settings')
  await router.navigate({
    to: '/teams/$teamId/dashboard',
    params: { teamId: 'b' },
  })

  await waitFor(() => expect(link).toHaveAttribute('href', '/teams/b/settings'))
  expect(link).not.toHaveAttribute('aria-current')
  router.history.destroy()
})
