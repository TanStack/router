import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * Pins the behavior discussed in
 * https://github.com/TanStack/router/issues/7110 and
 * https://github.com/TanStack/router/pull/7114
 *
 * `beforeLoad` returning `null` (e.g. a server function that resolves to
 * null) must behave like returning `undefined` for context purposes: the
 * merged route context keeps all parent/router-provided values and no `null`
 * leaks into or clobbers the merged context object.
 */

describe('beforeLoad returning null keeps merged context intact (issue #7110 / PR #7114)', () => {
  const setup = (beforeLoad: () => any) => {
    const loaderContexts: Array<Record<string, unknown>> = []

    const rootRoute = new BaseRootRoute({
      beforeLoad,
    })
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: ({ context }: { context: Record<string, unknown> }) => {
        loaderContexts.push(context)
        return null
      },
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      context: { foo: 'bar' },
    })

    return { router, rootRoute, indexRoute, loaderContexts }
  }

  test('sync beforeLoad returning null preserves router-provided context', async () => {
    const { router, rootRoute, indexRoute, loaderContexts } = setup(() => null)

    await router.load()

    const rootMatch = router.state.matches.find(
      (match) => match.routeId === rootRoute.id,
    )
    const indexMatch = router.state.matches.find(
      (match) => match.routeId === indexRoute.id,
    )

    expect(rootMatch?.status).toBe('success')
    expect(rootMatch?.context).toEqual({ foo: 'bar' })
    expect(indexMatch?.context).toEqual({ foo: 'bar' })

    // The child loader saw the merged context, not `{}` or `null`.
    expect(loaderContexts).toHaveLength(1)
    expect(loaderContexts[0]).toEqual({ foo: 'bar' })
  })

  test('async beforeLoad returning null preserves router-provided context', async () => {
    const { router, rootRoute, indexRoute, loaderContexts } = setup(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 1))
        return null
      },
    )

    await router.load()

    const rootMatch = router.state.matches.find(
      (match) => match.routeId === rootRoute.id,
    )
    const indexMatch = router.state.matches.find(
      (match) => match.routeId === indexRoute.id,
    )

    expect(rootMatch?.status).toBe('success')
    expect(rootMatch?.context).toEqual({ foo: 'bar' })
    expect(indexMatch?.context).toEqual({ foo: 'bar' })
    expect(loaderContexts).toHaveLength(1)
    expect(loaderContexts[0]).toEqual({ foo: 'bar' })
  })

  test('beforeLoad returning null does not clobber route context() contributions', async () => {
    const loaderContexts: Array<Record<string, unknown>> = []

    const rootRoute = new BaseRootRoute({
      context: () => ({ fromRouteContext: 'yes' }),
      beforeLoad: () => null,
    })
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: ({ context }: { context: Record<string, unknown> }) => {
        loaderContexts.push(context)
        return null
      },
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      context: { foo: 'bar' },
    })

    await router.load()

    const rootMatch = router.state.matches.find(
      (match) => match.routeId === rootRoute.id,
    )
    expect(rootMatch?.context).toEqual({
      foo: 'bar',
      fromRouteContext: 'yes',
    })
    expect(loaderContexts[0]).toEqual({
      foo: 'bar',
      fromRouteContext: 'yes',
    })
  })
})
