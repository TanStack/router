import * as Vue from 'vue'
import { cleanup, render, screen, waitFor } from '@testing-library/vue'
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

test('mounted external Links observe protocol allowlist changes', async () => {
  const root = createRootRoute({
    component: () => <Link to="custom:destination" data-testid="external" />,
  })
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/' }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    protocolAllowlist: ['custom:'],
  })
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    render(<RouterProvider router={router} />)
    const link = await screen.findByTestId('external')
    expect(link).toHaveAttribute('href', 'custom:destination')
    router.update({ protocolAllowlist: [] })
    await waitFor(() => expect(link).not.toHaveAttribute('href'))
    router.update({ protocolAllowlist: ['custom:'] })
    await waitFor(() =>
      expect(link).toHaveAttribute('href', 'custom:destination'),
    )
  } finally {
    warning.mockRestore()
    router.history.destroy()
  }
})

test.each(['/b', '.'] as const)(
  'retargeting an inactive Link to %s uses the latest published source',
  async (destination) => {
    const to = Vue.ref<'/target' | '/b' | '.'>('/target')
    const root = createRootRoute({
      component: () => (
        <>
          <Link to={to.value} data-testid="retargeted" />
          <Outlet />
        </>
      ),
    })
    const a = createRoute({ getParentRoute: () => root, path: '/a' })
    const b = createRoute({ getParentRoute: () => root, path: '/b' })
    const target = createRoute({ getParentRoute: () => root, path: '/target' })
    const router = createRouter({
      routeTree: root.addChildren([a, b, target]),
      history: createMemoryHistory({ initialEntries: ['/a'] }),
    })
    render(
      Vue.defineComponent({
        setup: () => () => <RouterProvider router={router} />,
      }),
    )
    const link = await screen.findByTestId('retargeted')
    expect(link).toHaveAttribute('href', '/target')
    expect(link).not.toHaveAttribute('aria-current')

    await router.navigate({ to: '/b' })
    await Vue.nextTick()
    expect(link).toHaveAttribute('href', '/target')
    expect(link).not.toHaveAttribute('aria-current')

    to.value = destination
    await Vue.nextTick()
    await waitFor(() => {
      expect(link).toHaveAttribute('href', '/b')
      expect(link).toHaveAttribute('aria-current', 'page')
    })
    router.history.destroy()
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
    component: () => (
      <>
        <Link from="/" to="/a" search={leavingSearch} data-testid="leaving" />
      </>
    ),
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
  render(
    Vue.defineComponent({
      setup: () => () => <RouterProvider router={router} />,
    }),
  )
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
  await Vue.nextTick()
  expect(leaving).toHaveAttribute('href', '/a?value=latest')
  release()
  await navigation
  await Vue.nextTick()
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
  render(
    Vue.defineComponent({
      setup: () => () => <RouterProvider router={router} />,
    }),
  )
  const link = await screen.findByTestId('target')
  expect(link).toHaveAttribute('href', '/target#/a')
  await router.navigate({ to: '/b' })
  await Vue.nextTick()
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
  render(
    Vue.defineComponent({
      setup: () => () => <RouterProvider router={router} />,
    }),
  )
  const link = await screen.findByTestId('target')
  expect(link).toHaveAttribute('href', '/target')
  router.update({ trailingSlash: 'always' } as any)
  await Vue.nextTick()
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
  render(
    Vue.defineComponent({
      setup: () => () => <RouterProvider router={router} />,
    }),
  )
  const link = await screen.findByTestId('target')
  expect(link).toHaveAttribute('href', '/teams/a/settings')
  await router.navigate({
    to: '/teams/$teamId/dashboard',
    params: { teamId: 'b' },
  })
  await Vue.nextTick()
  await waitFor(() => expect(link).toHaveAttribute('href', '/teams/b/settings'))
  expect(link).not.toHaveAttribute('aria-current')
  router.history.destroy()
})
