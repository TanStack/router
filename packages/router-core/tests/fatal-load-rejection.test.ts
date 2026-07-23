import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  redirect,
} from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * A genuinely fatal router rejection (not a route outcome — for example,
 * redirect resolution throwing while finalizing a serial beforeLoad
 * redirect) must settle without publishing matches whose load
 * promises never settled: the serial redirect capped the loader prefix at 0,
 * so the loader phase never ran for ancestor matches and their pending
 * loadPromise would hang Suspense forever.
 */

describe('fatal load rejection', () => {
  test('fatal rejection during a serial-redirect-capped pass settles the lane', async () => {
    const boom = new Error('resolveRedirect failed')
    const errorComponentGate = createControlledPromise<void>()
    const errorComponentStarted = createControlledPromise<void>()
    const errorComponentPreload = vi.fn(() => {
      errorComponentStarted.resolve()
      return errorComponentGate
    })
    const ErrorComponent = Object.assign(() => null, {
      preload: errorComponentPreload,
    })

    const rootRoute = new BaseRootRoute({
      // Never runs: the serial redirect caps the loader prefix at 0. Its
      // loadPromise (created for the beforeLoad phase) must still settle.
      loader: () => 'root data',
      errorComponent: ErrorComponent,
    })
    const badRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/bad',
      beforeLoad: () => {
        throw redirect({
          to: '/bad',
          search: () => {
            throw boom
          },
        })
      },
    })
    const safeLoader = vi.fn(() => 'safe data')
    const safeRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/safe',
      loader: safeLoader,
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([badRoute, safeRoute]),
      history: createMemoryHistory({ initialEntries: ['/bad'] }),
    })

    const load = router.load()
    const outcome = await Promise.race([
      load.then(() => 'load-settled' as const),
      errorComponentStarted.then(() => 'error-preload-started' as const),
    ])
    if (outcome === 'error-preload-started') {
      errorComponentGate.resolve()
    }
    expect(outcome).toBe('load-settled')
    await load
    expect(errorComponentPreload).not.toHaveBeenCalled()
    expect(router.state.status).toBe('idle')

    errorComponentGate.resolve()
    await router.navigate({ to: '/safe' })
    expect(router.state.location.pathname).toBe('/safe')
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: safeRoute.id,
      status: 'success',
      loaderData: 'safe data',
    })
    expect(safeLoader).toHaveBeenCalledTimes(1)
  })
})
