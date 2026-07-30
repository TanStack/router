import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('HMR route refresh', () => {
  test('reloads retained routes with onStay lifecycle semantics', async () => {
    let generation = 1
    const loader = vi.fn(() => generation)
    const onEnter = vi.fn()
    const onLeave = vi.fn()
    const order: Array<string> = []
    const onStay = vi.fn(() => order.push('onStay'))
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      loader,
      onEnter,
      onLeave,
      onStay,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })

    await router.load()
    const unsubLoad = router.subscribe('onLoad', () => order.push('onLoad'))
    const unsubMount = router.subscribe('onBeforeRouteMount', () =>
      order.push('onBeforeRouteMount'),
    )
    generation = 2
    await router._refreshRoute!()

    expect(loader).toHaveBeenCalledTimes(2)
    expect(router.state.matches.at(-1)?.loaderData).toBe(2)
    expect(onEnter).toHaveBeenCalledTimes(1)
    expect(onLeave).not.toHaveBeenCalled()
    expect(onStay).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['onStay', 'onLoad', 'onBeforeRouteMount'])
    unsubLoad()
    unsubMount()
  })

  test('rolls overlapping refreshes back to the last acknowledged generation', async () => {
    let generation = 1
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      loader: () => generation,
      onStay: () => {
        if (generation === 3) {
          throw new Error('replacement lifecycle failed')
        }
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })

    await router.load()
    let transitionCount = 0
    let pending: ((rendered: boolean) => void) | undefined
    router.startTransition = (fn) => {
      transitionCount++
      pending?.(false)
      pending = undefined
      fn()
      if (transitionCount === 1) {
        return new Promise<boolean>((resolve) => {
          pending = resolve
        })
      }
      return Promise.resolve(true)
    }

    generation = 2
    const firstRefresh = router._refreshRoute!()
    await vi.waitFor(() => expect(transitionCount).toBe(1))

    generation = 3
    const secondRefresh = router._refreshRoute!()
    await Promise.all([firstRefresh, secondRefresh])

    expect(router.state.status).toBe('idle')
    expect(router.state.matches.at(-1)?.loaderData).toBe(1)
  })

  test('does not resolve a superseding navigation promise during rollback', async () => {
    let generation = 1
    const destinationGate = createControlledPromise<void>()
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      loader: () => generation,
    })
    const destinationRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/destination',
      loader: () => destinationGate,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute, destinationRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })

    await router.load()
    let transitionCount = 0
    let pending: ((rendered: boolean) => void) | undefined
    router.startTransition = (fn) => {
      transitionCount++
      pending?.(false)
      pending = undefined
      fn()
      if (transitionCount === 1) {
        return new Promise<boolean>((resolve) => {
          pending = resolve
        })
      }
      return Promise.resolve(true)
    }

    generation = 2
    const refresh = router._refreshRoute!()
    await vi.waitFor(() => expect(transitionCount).toBe(1))

    const navigationSettled = vi.fn()
    const navigation = router
      .navigate({ to: '/destination' })
      .then(navigationSettled)
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/destination'),
    )
    expect(navigationSettled).not.toHaveBeenCalled()

    destinationGate.resolve()
    await Promise.all([refresh, navigation])
    expect(navigationSettled).toHaveBeenCalledOnce()
    expect(router.state.matches.at(-1)?.routeId).toBe(destinationRoute.id)
  })
})
