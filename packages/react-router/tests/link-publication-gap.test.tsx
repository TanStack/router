import * as React from 'react'
import { flushSync } from 'react-dom'
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
  redirect,
} from '../src'

afterEach(cleanup)

test('a cold outgoing Link mounted during redirect transfer retains its source', async () => {
  let mountLink!: () => void
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const root = createRootRoute({
    validateSearch: (search) => ({ value: String(search.value ?? '') }),
    component: Outlet,
  })
  const a = createRoute({
    getParentRoute: () => root,
    path: '/a',
    component: function A() {
      const [show, setShow] = React.useState(false)
      mountLink = () => setShow(true)
      return show ? (
        <Link to="/a" search={true} data-testid="cold" />
      ) : (
        <div>A</div>
      )
    },
  })
  const b = createRoute({
    getParentRoute: () => root,
    path: '/b',
    beforeLoad: () => {
      throw redirect({ to: '/c', search: { value: 'c' } })
    },
  })
  const c = createRoute({
    getParentRoute: () => root,
    path: '/c',
    loader: () => pending,
  })
  const history = createMemoryHistory({ initialEntries: ['/a?value=a'] })
  const router = createRouter({
    routeTree: root.addChildren([a, b, c]),
    history,
    defaultPendingMs: Infinity,
  })
  render(<RouterProvider router={router} />)
  await screen.findByText('A')
  const unsubscribe = router.subscribe('onBeforeNavigate', ({ toLocation }) => {
    if (toLocation.pathname === '/c') {
      flushSync(mountLink)
    }
  })
  let navigation!: Promise<void>
  act(() => {
    navigation = router.navigate({ to: '/b', search: { value: 'b' } })
  })
  const link = await screen.findByTestId('cold')
  await waitFor(() => expect(router.state.location.pathname).toBe('/c'))
  expect(link).toHaveAttribute('href', '/a?value=a')
  release()
  await act(() => navigation)
  unsubscribe()
  history.destroy()
})

test('a navigation from a Link callback stops the obsolete publication', async () => {
  let navigate: (() => void) | undefined
  const firstSearch = (search: Record<string, unknown>) => {
    if (search.value === 1 && navigate) {
      const next = navigate
      navigate = undefined
      next()
    }
    return search
  }
  const secondSearch = vi.fn((search) => search)
  const root = createRootRoute({
    component: () => (
      <>
        <Link to="/a" search={firstSearch} data-testid="first" />
        <Link to="/a" search={secondSearch} data-testid="second" />
        <Outlet />
      </>
    ),
  })
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/a' }),
      createRoute({ getParentRoute: () => root, path: '/c' }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/a?value=0'] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByTestId('first')
  navigate = () => {
    void router.navigate({ to: '/c', search: { value: 2 } } as any)
  }
  await act(() => router.navigate({ to: '/a', search: { value: 1 } } as any))
  await waitFor(() => expect(router.state.location.pathname).toBe('/c'))
  await waitFor(() => {
    expect(screen.getByTestId('first')).toHaveAttribute('href', '/a?value=2')
    expect(screen.getByTestId('second')).toHaveAttribute('href', '/a?value=2')
  })
  expect(secondSearch).toHaveBeenLastCalledWith({ value: 2 })
  router.history.destroy()
})

test('retargeting the last departing Link preserves its actual published source across subscription replacement', async () => {
  let releaseA!: () => void
  let releaseB!: () => void
  const pendingA = new Promise<void>((resolve) => {
    releaseA = resolve
  })
  const pendingB = new Promise<void>((resolve) => {
    releaseB = resolve
  })
  const inheritSearch = vi.fn((search: { value: number }) => search)
  const root = createRootRoute({
    validateSearch: (search) => ({ value: Number(search.value) || 0 }),
    component: Outlet,
  })
  const a = createRoute({
    getParentRoute: () => root,
    path: '/a',
    loaderDeps: ({ search }) => ({ value: search.value }),
    loader: ({ deps }) => (deps.value === 1 ? pendingA : undefined),
    component: function A() {
      const [hash, setHash] = React.useState('old')
      return (
        <>
          <button onClick={() => setHash('new')}>Retarget Link</button>
          <Link
            to="/a"
            search={inheritSearch}
            hash={hash}
            data-testid="departing"
          />
        </>
      )
    },
  })
  const b = createRoute({
    getParentRoute: () => root,
    path: '/b',
    loader: () => pendingB,
  })
  const history = createMemoryHistory({ initialEntries: ['/a?value=0'] })
  const router = createRouter({
    routeTree: root.addChildren([a, b]),
    history,
    defaultPendingMs: Infinity,
  })
  render(<RouterProvider router={router} />)
  const link = await screen.findByTestId('departing')
  expect(link).toHaveAttribute('href', '/a?value=0#old')
  let navigationA!: Promise<void>
  act(() => {
    navigationA = router.navigate({ to: '/a', search: { value: 1 } })
  })
  await waitFor(() => expect(link).toHaveAttribute('href', '/a?value=1#old'))
  expect(router.state.resolvedLocation?.search.value).toBe(0)
  let navigationB!: Promise<void>
  act(() => {
    navigationB = router.navigate({ to: '/b', search: { value: 2 } })
  })
  await waitFor(() => expect(router.state.location.pathname).toBe('/b'))
  expect(link).toHaveAttribute('href', '/a?value=1#old')
  fireEvent.click(screen.getByRole('button', { name: 'Retarget Link' }))
  expect(link).toHaveAttribute('href', '/a?value=1#new')
  expect(inheritSearch).toHaveBeenLastCalledWith({ value: 1 })
  releaseA()
  releaseB()
  await act(async () => {
    await Promise.all([navigationA, navigationB])
  })
  history.destroy()
})
