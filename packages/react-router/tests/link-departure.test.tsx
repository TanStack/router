import React from 'react'
import { flushSync } from 'react-dom'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createControlledPromise,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(cleanup)

test('a departing Link removed by another updater does not resume work after unmount', async () => {
  const gate = createControlledPromise<void>()
  const departingSearch = vi.fn(() => ({ section: 'departing' }))
  let hideDeparting!: () => void
  let armed = false
  const persistentSearch = (previous: Record<string, unknown>) => {
    if (armed) {
      armed = false
      // A Link updater is public user code. Its synchronous UI change can
      // remove another Link before navigation publishes its rendered matches.
      flushSync(() => hideDeparting())
    }
    return previous
  }
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <Outlet />
        <Link to="/target" search={persistentSearch}>
          Persistent link
        </Link>
      </>
    ),
  })
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/home',
    component: function Home() {
      const [visible, setVisible] = React.useState(true)
      hideDeparting = () => setVisible(false)
      return visible ? (
        <Link to="/target" search={departingSearch}>
          Departing link
        </Link>
      ) : null
    },
  })
  const awayRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/away',
    loader: () => gate,
    component: () => <p>Away page</p>,
  })
  const targetRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/target',
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, awayRoute, targetRoute]),
    history: createMemoryHistory({ initialEntries: ['/home'] }),
    defaultPendingMs: 60_000,
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('link', { name: 'Departing link' })
  await waitFor(() => expect(router.state.status).toBe('idle'))
  armed = true

  let navigation!: Promise<void>
  await act(async () => {
    navigation = router.navigate({ to: '/away' })
    await Promise.resolve()
  })
  expect(screen.queryByRole('link', { name: 'Departing link' })).toBeNull()
  expect(
    screen.getByRole('link', { name: 'Persistent link' }),
  ).toBeInTheDocument()
  const callsAfterUnmount = departingSearch.mock.calls.length

  await act(async () => {
    gate.resolve()
    await navigation
  })
  await screen.findByText('Away page')
  expect(departingSearch).toHaveBeenCalledTimes(callsAfterUnmount)
})
