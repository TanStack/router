import * as React from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
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
    act(() => router.update({ protocolAllowlist: [] }))
    await waitFor(() => expect(link).not.toHaveAttribute('href'))
    act(() => router.update({ protocolAllowlist: ['custom:'] }))
    await waitFor(() =>
      expect(link).toHaveAttribute('href', 'custom:destination'),
    )
  } finally {
    warning.mockRestore()
    router.history.destroy()
  }
})

test('an abandoned speculative target does not retarget the committed Link subscription', async () => {
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const attempted = vi.fn()
  function SuspendAfterLink({ target }: { target: '/a' | '/b' }) {
    if (target === '/b') {
      attempted()
      throw pending
    }
    return null
  }
  function Targets() {
    const [target, setTarget] = React.useState<'/a' | '/b'>('/a')
    return (
      <>
        <button onClick={() => React.startTransition(() => setTarget('/b'))}>
          Try suspended target
        </button>
        <button onClick={() => setTarget('/a')}>Keep committed target</button>
        <React.Suspense fallback={<p>Suspended target</p>}>
          <Link to={target} data-testid="committed-target" />
          <SuspendAfterLink target={target} />
        </React.Suspense>
      </>
    )
  }
  const root = createRootRoute({
    component: () => (
      <>
        <Targets />
        <Outlet />
      </>
    ),
  })
  const routes = ['/a', '/b', '/c'].map((path) =>
    createRoute({ getParentRoute: () => root, path }),
  )
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ['/a'] }),
  })
  render(<RouterProvider router={router} />)
  const link = await screen.findByTestId('committed-target')
  expect(link).toHaveAttribute('href', '/a')
  expect(link).toHaveAttribute('aria-current', 'page')

  fireEvent.click(screen.getByRole('button', { name: 'Try suspended target' }))
  await waitFor(() => expect(attempted).toHaveBeenCalled())
  expect(screen.queryByText('Suspended target')).not.toBeInTheDocument()
  expect(link).toHaveAttribute('href', '/a')

  await act(() => router.navigate({ to: '/c' }))
  expect(link).toHaveAttribute('href', '/a')
  expect(link).not.toHaveAttribute('aria-current')
  await act(() => router.navigate({ to: '/a' }))
  expect(link).toHaveAttribute('aria-current', 'page')

  fireEvent.click(screen.getByRole('button', { name: 'Keep committed target' }))
  await act(async () => release())
  await act(() => router.navigate({ to: '/b' }))
  expect(screen.getByTestId('committed-target')).toBe(link)
  expect(link).toHaveAttribute('href', '/a')
  expect(link).not.toHaveAttribute('aria-current')
  router.history.destroy()
})

test('departing Links retain their published source, including during parent renders, and catch up on a successor', async () => {
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
      const [count, setCount] = React.useState(0)
      return (
        <>
          <button onClick={() => setCount(count + 1)}>render {count}</button>
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
  render(<RouterProvider router={router} />)
  const leaving = await screen.findByTestId('leaving')
  expect(leaving).toHaveAttribute('href', '/a?value=old')
  const before = leavingSearch.mock.calls.length
  let navigation!: Promise<void>
  act(() => {
    navigation = router.navigate({ to: '/b', search: { value: 'new' } } as any)
  })
  await waitFor(() => expect(router.state.location.pathname).toBe('/b'))
  expect(screen.getByTestId('staying')).toHaveAttribute('href', '/a?value=new')
  expect(leavingSearch).toHaveBeenCalledTimes(before)
  expect(leaving).toHaveAttribute('href', '/a?value=old')
  fireEvent.click(screen.getByRole('button', { name: 'render 0' }))
  expect(leaving).toHaveAttribute('href', '/a?value=old')
  expect(leavingSearch).toHaveBeenCalledTimes(before)
  await act(() =>
    router.navigate({ to: '/a', search: { value: 'latest' } } as any),
  )
  expect(leaving).toHaveAttribute('href', '/a?value=latest')
  release()
  await act(() => navigation)
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
  render(<RouterProvider router={router} />)
  const link = await screen.findByTestId('target')
  expect(link).toHaveAttribute('href', '/target#/a')
  await act(() => router.navigate({ to: '/b' }))

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
  render(<RouterProvider router={router} />)
  const link = await screen.findByTestId('target')
  expect(link).toHaveAttribute('href', '/target')
  act(() => router.update({ trailingSlash: 'always' } as any))

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
  render(<RouterProvider router={router} />)
  const link = await screen.findByTestId('target')
  expect(link).toHaveAttribute('href', '/teams/a/settings')
  await act(() =>
    router.navigate({
      to: '/teams/$teamId/dashboard',
      params: { teamId: 'b' },
    }),
  )

  await waitFor(() => expect(link).toHaveAttribute('href', '/teams/b/settings'))
  expect(link).not.toHaveAttribute('aria-current')
  router.history.destroy()
})
