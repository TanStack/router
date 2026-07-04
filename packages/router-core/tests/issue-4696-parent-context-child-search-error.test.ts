import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * Repro for https://github.com/TanStack/router/issues/4696
 *
 * A parent (root) route has `beforeLoad` returning context that its own
 * loader depends on. A child route's `validateSearch` throws when required
 * search params are missing. Navigating directly to the child without the
 * required search params must not prevent the parent's loader from seeing the
 * parent's beforeLoad context.
 *
 * The bug was that the child's search validation error short-circuited the
 * serial beforeLoad phase in a way that left ancestor loaders running with a
 * context that was missing the ancestors' beforeLoad contributions.
 */

describe("parent context when child validateSearch fails (issue #4696)", () => {
  const setup = () => {
    const rootLoaderContexts: Array<Record<string, unknown>> = []

    const rootRoute = new BaseRootRoute({
      beforeLoad: async () => {
        await new Promise((resolve) => setTimeout(resolve, 1))
        return { auth: 'authenticated' as const }
      },
      loader: ({ context }: { context: Record<string, unknown> }) => {
        rootLoaderContexts.push(context)
        return { navbar: true }
      },
    })
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const dashboardRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/dashboard',
      validateSearch: (search: Record<string, unknown>) => {
        if (typeof search.page !== 'number') {
          throw new Error('page search param is required')
        }
        return { page: search.page }
      },
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, dashboardRoute]),
      history: createMemoryHistory({ initialEntries: ['/dashboard'] }),
    })

    return { router, rootRoute, dashboardRoute, rootLoaderContexts }
  }

  test('root loader receives root beforeLoad context when child validateSearch throws on initial load', async () => {
    const { router, rootRoute, dashboardRoute, rootLoaderContexts } = setup()

    await router.load()

    // The root loader ran and observed its own beforeLoad context.
    expect(rootLoaderContexts).toHaveLength(1)
    expect(rootLoaderContexts[0]).toMatchObject({ auth: 'authenticated' })

    const rootMatch = router.state.matches.find(
      (match) => match.routeId === rootRoute.id,
    )
    const dashboardMatch = router.state.matches.find(
      (match) => match.routeId === dashboardRoute.id,
    )

    // The root still rendered successfully with its loader data (the navbar
    // in the original issue) and a fully merged context.
    expect(rootMatch?.status).toBe('success')
    expect(rootMatch?.loaderData).toEqual({ navbar: true })
    expect(rootMatch?.context).toMatchObject({ auth: 'authenticated' })

    // The search validation failure is owned by the child match.
    expect(dashboardMatch?.status).toBe('error')
    expect(dashboardMatch?.error).toBeInstanceOf(Error)
    expect((dashboardMatch?.error as Error).message).toBe(
      'page search param is required',
    )
  })

  test('root loader keeps beforeLoad context when navigating from a valid route to the failing child', async () => {
    const { router, rootRoute, rootLoaderContexts } = setup()

    await router.load()
    rootLoaderContexts.length = 0

    await router.navigate({ to: '/' })
    await router.navigate({ to: '/dashboard' })

    // Force the lane to reload while the child sits in its search-error
    // state: the root loader must re-run and still see the full beforeLoad
    // context. (Stay-match navigations alone do not re-run the root loader,
    // which would leave this scenario unexercised.)
    await router.invalidate()

    const rootMatch = router.state.matches.find(
      (match) => match.routeId === rootRoute.id,
    )
    expect(rootMatch?.status).toBe('success')
    expect(rootMatch?.context).toMatchObject({ auth: 'authenticated' })

    expect(rootLoaderContexts.length).toBeGreaterThan(0)
    for (const context of rootLoaderContexts) {
      expect(context).toMatchObject({ auth: 'authenticated' })
    }
  })
})
