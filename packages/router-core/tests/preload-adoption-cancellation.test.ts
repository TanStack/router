import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
} from '../src'
import { createTestRouter } from './routerTestUtils'

test('superseded router.load stops waiting for a never-settling adopted preload', async () => {
  const loaderGate = createControlledPromise<string>()
  const loader = vi.fn(() => loaderGate)

  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const fooRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/foo',
    loader,
  })
  const barRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/bar',
  })
  const history = createMemoryHistory({ initialEntries: ['/'] })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute, fooRoute, barRoute]),
    history,
  })

  await router.load()
  void router.preloadRoute({ to: '/foo' })
  await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))

  history.push('/foo')
  let fooSettled = false
  const fooLoad = router.load().then(() => {
    fooSettled = true
  })
  await vi.waitFor(() => {
    expect(router.stores.location.get().pathname).toBe('/foo')
    expect(router.stores.isLoading.get()).toBe(true)
  })

  history.push('/bar')
  await router.load()
  expect(router.state.location.pathname).toBe('/bar')
  await vi.waitFor(() => expect(fooSettled).toBe(true))
  await fooLoad
  expect(loader).toHaveBeenCalledTimes(1)
})
