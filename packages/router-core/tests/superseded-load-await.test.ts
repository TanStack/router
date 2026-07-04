import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * awaiting router.load() or router.invalidate() should remain a
 * reliable synchronization point even when that load is superseded. If the
 * abandoned load resolves immediately, callers can observe router state before
 * the newer load has settled.
 *
 * This test starts a real public router.load() for /one, supersedes it with a
 * real navigation to /two, and resolves only the abandoned /one loader. The
 * original await should not settle until the superseding /two loader settles.
 */

const waitForMacrotask = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })

describe('superseded load await', () => {
  test('router.load waits for a superseding navigation load to settle', async () => {
    const firstLoaderGate = createControlledPromise<void>()
    const secondLoaderGate = createControlledPromise<void>()
    let firstLoaderCalls = 0
    let secondLoaderCalls = 0
    let secondLoaderSettled = false
    let supersededLoadSettled = false

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const firstRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/one',
      loader: async () => {
        firstLoaderCalls++
        await firstLoaderGate
        return 'one'
      },
    })
    const secondRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/two',
      loader: async () => {
        secondLoaderCalls++
        await secondLoaderGate
        secondLoaderSettled = true
        return 'two'
      },
    })

    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, firstRoute, secondRoute]),
      history,
    })

    await router.load()

    history.push('/one')
    const supersededLoad = router.load().then(() => {
      supersededLoadSettled = true
    })
    await vi.waitFor(() => expect(firstLoaderCalls).toBe(1))

    const latestNavigation = router.navigate({ to: '/two' })
    await vi.waitFor(() => expect(secondLoaderCalls).toBe(1))

    firstLoaderGate.resolve()
    await waitForMacrotask()

    expect(secondLoaderSettled).toBe(false)
    expect(supersededLoadSettled).toBe(false)

    secondLoaderGate.resolve()
    await Promise.all([supersededLoad, latestNavigation])

    expect(secondLoaderSettled).toBe(true)
    expect(supersededLoadSettled).toBe(true)
  })

  // Multi-supersession drain: L1 superseded by L2 superseded by L3, and a
  // fourth navigation (L4) started while L1 is already parked in its drain
  // loop. Gates resolve out of order. L1's public await must not settle until
  // the entire navigation chain drains (L4 commits), which forces the drain
  // loop to re-read latestLoadPromise across multiple iterations.
  test('superseded load drains a multi-supersession chain (out-of-order gates)', async () => {
    const gates = {
      one: createControlledPromise<void>(),
      two: createControlledPromise<void>(),
      three: createControlledPromise<void>(),
      four: createControlledPromise<void>(),
    }
    const calls: Array<string> = []
    let load1Settled = false
    let lastSettled: string | undefined

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const mkRoute = (name: keyof typeof gates) =>
      new BaseRoute({
        getParentRoute: () => rootRoute,
        path: `/${name}`,
        loader: async () => {
          calls.push(name)
          await gates[name]
          lastSettled = name
          return name
        },
      })
    const one = mkRoute('one')
    const two = mkRoute('two')
    const three = mkRoute('three')
    const four = mkRoute('four')

    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, one, two, three, four]),
      history,
    })
    await router.load()

    history.push('/one')
    const load1 = router.load().then(() => {
      load1Settled = true
    })
    await vi.waitFor(() => expect(calls).toContain('one'))

    const nav2 = router.navigate({ to: '/two' })
    await vi.waitFor(() => expect(calls).toContain('two'))
    const nav3 = router.navigate({ to: '/three' })
    await vi.waitFor(() => expect(calls).toContain('three'))

    // Finish L1's own pass first: it must park in the drain loop.
    gates.one.resolve()
    await waitForMacrotask()
    expect(load1Settled).toBe(false)

    // Now start a 4th navigation while L1 is already awaiting the chain.
    const nav4 = router.navigate({ to: '/four' })
    await vi.waitFor(() => expect(calls).toContain('four'))

    // Resolve remaining gates out of order: L3, then L2, then L4.
    gates.three.resolve()
    await waitForMacrotask()
    expect(load1Settled).toBe(false)

    gates.two.resolve()
    await waitForMacrotask()
    expect(load1Settled).toBe(false)

    gates.four.resolve()
    await Promise.all([load1, nav2, nav3, nav4])

    expect(load1Settled).toBe(true)
    expect(lastSettled).toBe('four')
    expect(router.latestLoadPromise).toBeUndefined()
    expect(
      router.stores.matches.get().some((m) => m.routeId === '/four'),
    ).toBe(true)
  })
})
