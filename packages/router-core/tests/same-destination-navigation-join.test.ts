import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

describe('same-destination navigation while one is in flight', () => {
  function setup() {
    const gate = createControlledPromise<string>()
    const loader = vi.fn(() => gate)
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
      loader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    return { router, loader, gate, targetRoute }
  }

  test('a second navigation to the same destination joins the in-flight load', async () => {
    const { router, loader, gate, targetRoute } = setup()
    await router.load()

    const first = router.navigate({ to: '/target' })
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1))
    const second = router.navigate({ to: '/target' })

    gate.resolve('once')
    await Promise.all([first, second])

    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'success',
      loaderData: 'once',
    })
  })

  test('a double navigation in the same tick joins the in-flight load', async () => {
    const { router, loader, gate, targetRoute } = setup()
    await router.load()

    const first = router.navigate({ to: '/target' })
    const second = router.navigate({ to: '/target' })

    gate.resolve('once')
    await Promise.all([first, second])

    expect(loader).toHaveBeenCalledTimes(1)
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'success',
      loaderData: 'once',
    })
  })

  test('invalidate reruns the loader after the navigation settles', async () => {
    const { router, loader, gate } = setup()
    gate.resolve('data')
    await router.load()
    await router.navigate({ to: '/target' })
    expect(loader).toHaveBeenCalledTimes(1)

    await router.invalidate()

    expect(loader).toHaveBeenCalledTimes(2)
  })

  test('a repeat navigation after settle reloads instead of joining', async () => {
    const { router, loader, gate, targetRoute } = setup()
    gate.resolve('data')
    await router.load()
    await router.navigate({ to: '/target' })

    // Once the first navigation settles there is nothing to join: a repeat
    // same-destination navigation keeps its refresh semantics.
    await router.navigate({ to: '/target' })

    expect(loader).toHaveBeenCalledTimes(2)
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'success',
    })
  })
})
