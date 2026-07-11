import { cleanup, render, screen, waitFor } from '@solidjs/testing-library'
import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
})

test('remounting an SSR-marked router loads a history change that happened while unmounted', async () => {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Index</div>,
  })
  const nextRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/next',
    component: () => <div>Next</div>,
  })
  const history = createMemoryHistory({ initialEntries: ['/'] })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, nextRoute]),
    history,
  })

  // This is the stable post-hydration shape: server matches are active and
  // the persistent SSR marker tells the first Transitioner mount not to load.
  await router.load()
  router.ssr = { manifest: { routes: {} } }

  const firstRender = render(() => <RouterProvider router={router} />)
  expect(await screen.findByText('Index')).toBeInTheDocument()

  firstRender.unmount()
  history.push('/next')

  const secondRender = render(() => <RouterProvider router={router} />)
  expect(await screen.findByText('Next')).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/next')

  secondRender.unmount()
  history.replace('/next', { remounted: true })

  render(() => <RouterProvider router={router} />)
  await waitFor(() => {
    expect((router.state.location.state as any).remounted).toBe(true)
  })
})

test('remounting the provider emits onRendered for the newly mounted DOM', async () => {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div>Index</div>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const onRendered = vi.fn()
  const unsubscribe = router.subscribe('onRendered', onRendered)

  const firstRender = render(() => <RouterProvider router={router} />)
  expect(await screen.findByText('Index')).toBeInTheDocument()
  await waitFor(() => expect(onRendered).toHaveBeenCalledTimes(1))

  firstRender.unmount()
  render(() => <RouterProvider router={router} />)
  expect(await screen.findByText('Index')).toBeInTheDocument()
  await waitFor(() => expect(onRendered).toHaveBeenCalledTimes(2))

  unsubscribe()
})
