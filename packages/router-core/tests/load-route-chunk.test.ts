import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

test('router.loadRouteChunk exposes a failed lazy import and remains retryable', async () => {
  const chunkError = new TypeError('Failed to fetch lazy route')
  const component = () => null
  let fail = true
  const rootRoute = new BaseRootRoute({})
  const route = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/route',
  }).lazy(() => {
    if (fail) {
      fail = false
      return Promise.reject(chunkError)
    }
    return Promise.resolve({ options: { component } } as any)
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await expect(router.loadRouteChunk(route as any)).rejects.toBe(chunkError)
  await router.loadRouteChunk(route as any)

  expect(route.options.component).toBe(component)
})

test('router.loadRouteChunk resolves with undefined after preloading both components', async () => {
  const component = Object.assign(() => null, {
    preload: vi.fn(async () => {}),
  })
  const pendingComponent = Object.assign(() => null, {
    preload: vi.fn(async () => {}),
  })
  const rootRoute = new BaseRootRoute({})
  const route = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/route',
    component,
    pendingComponent,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await expect(router.loadRouteChunk(route as any)).resolves.toBeUndefined()
  await expect(router.loadRouteChunk(route as any)).resolves.toBeUndefined()
  expect(component.preload).toHaveBeenCalledTimes(2)
  expect(pendingComponent.preload).toHaveBeenCalledTimes(2)
})

test('a stale lazy import cannot install options over its HMR successor', async () => {
  const staleImport = createControlledPromise<any>()
  const currentImport = createControlledPromise<any>()
  const staleComponent = () => null
  const currentComponent = () => null
  const rootRoute = new BaseRootRoute({})
  const route = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/route',
  }).lazy(() => staleImport)
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  const staleLoad = router.loadRouteChunk(route as any)
  route._lazy = undefined
  route.lazyFn = () => currentImport
  const currentLoad = router.loadRouteChunk(route as any)
  const currentOwner = route._lazy

  staleImport.resolve({ options: { component: staleComponent } })
  await staleLoad

  expect(route.options.component).not.toBe(staleComponent)
  expect(route._lazy).toBe(currentOwner)

  currentImport.resolve({ options: { component: currentComponent } })
  await currentLoad

  expect(route.options.component).toBe(currentComponent)
  expect(route._lazy).toBe(true)
})

test('a stale lazy rejection cannot clear its HMR successor', async () => {
  const staleImport = createControlledPromise<any>()
  const currentImport = createControlledPromise<any>()
  const staleError = new Error('obsolete import failed')
  const currentComponent = () => null
  const rootRoute = new BaseRootRoute({})
  const route = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/route',
  }).lazy(() => staleImport)
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  const staleLoad = router.loadRouteChunk(route as any)
  route._lazy = undefined
  route.lazyFn = () => currentImport
  const currentLoad = router.loadRouteChunk(route as any)
  const currentOwner = route._lazy

  staleImport.reject(staleError)
  await expect(staleLoad).rejects.toBe(staleError)
  expect(route._lazy).toBe(currentOwner)

  currentImport.resolve({ options: { component: currentComponent } })
  await currentLoad

  expect(route.options.component).toBe(currentComponent)
  expect(route._lazy).toBe(true)
})
