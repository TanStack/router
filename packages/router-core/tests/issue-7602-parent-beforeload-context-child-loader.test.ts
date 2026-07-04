import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * Repro for https://github.com/TanStack/router/issues/7602
 *
 * A parent route's async `beforeLoad` returns context that a child route's
 * loader (and the child's published match) depend on. On a return navigation
 * the child match is reused from cache with `status: 'success'` and its stale
 * loader reload runs in the background. The bug was that the reused child was
 * published with a context that did not yet include the parent's fresh
 * beforeLoad contribution, so readers observed `context.number === undefined`
 * while the child loader was still executing.
 *
 * Desired behavior: whenever the child match is published, its `context`
 * already carries the parent's beforeLoad context, and every child loader
 * invocation observes that context too.
 */

describe('parent beforeLoad context propagation to child (issue #7602)', () => {
  const setup = () => {
    const loaderContextNumbers: Array<unknown> = []
    let loaderRuns = 0
    const secondLoaderGate = createControlledPromise<void>()

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const reproRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/repro',
      beforeLoad: async () => {
        // Async so there is a real window between match creation and the
        // beforeLoad context becoming available.
        await new Promise((resolve) => setTimeout(resolve, 1))
        return { number: 42 }
      },
    })
    const reproIndexRoute = new BaseRoute({
      getParentRoute: () => reproRoute,
      path: '/',
      loader: async ({ context }: { context: { number?: number } }) => {
        loaderRuns += 1
        loaderContextNumbers.push(context.number)
        if (loaderRuns > 1) {
          // Keep the return-navigation reload in flight so the test can
          // observe the published child match while its loader is executing.
          await secondLoaderGate
        }
        return { visit: loaderRuns }
      },
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        reproRoute.addChildren([reproIndexRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/repro'] }),
    })

    return {
      router,
      reproIndexRoute,
      loaderContextNumbers,
      secondLoaderGate,
      getChildMatch: () =>
        router.state.matches.find(
          (match) => match.routeId === reproIndexRoute.id,
        ),
    }
  }

  test('child loader sees parent beforeLoad context on first visit', async () => {
    const { router, loaderContextNumbers, getChildMatch } = setup()

    await router.load()

    expect(loaderContextNumbers).toEqual([42])
    expect(getChildMatch()?.context).toMatchObject({ number: 42 })
  })

  test('reused child match is republished with fresh parent beforeLoad context while its reload is still running', async () => {
    const {
      router,
      loaderContextNumbers,
      secondLoaderGate,
      getChildMatch,
    } = setup()

    await router.load()
    expect(loaderContextNumbers).toEqual([42])

    // Leave /repro (child match with a loader is cached), then come back.
    await router.navigate({ to: '/' })
    expect(getChildMatch()).toBeUndefined()

    await router.navigate({ to: '/repro' })

    // The child match was reused from cache as a success match and its stale
    // reload is non-blocking, so the navigation commits while the second
    // loader invocation is still pending behind the gate.
    const childAfterCommit = getChildMatch()
    expect(childAfterCommit?.status).toBe('success')

    // Desired behavior from the issue: the republished child must immediately
    // carry the parent's beforeLoad context — never `undefined`.
    expect(childAfterCommit?.context).toMatchObject({ number: 42 })

    // The in-flight reload also observed the fresh parent context.
    await vi.waitFor(() => expect(loaderContextNumbers).toHaveLength(2))
    expect(loaderContextNumbers).toEqual([42, 42])

    secondLoaderGate.resolve()
    await vi.waitFor(() => expect(getChildMatch()?.isFetching).toBe(false))

    expect(getChildMatch()?.context).toMatchObject({ number: 42 })
  })
})
