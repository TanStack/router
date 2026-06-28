import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * Issue 11: background reloads should not commit fresh loaderData when route
 * asset projection for that fresh data fails. Otherwise the router can expose
 * new data while meta/scripts still describe the previous data snapshot.
 *
 * This test performs a real same-location background reload after the route is
 * stale. The second loader returns fresh data and head throws for that data;
 * the active match should keep the old loaderData and old projected assets.
 */

describe('issue 11: background asset projection failure', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('does not commit fresh loaderData when background asset projection fails', async () => {
    let resolveStaleReload!: (data: { title: string }) => void
    let loaderCalls = 0
    let headCalls = 0
    const loader = () => {
      loaderCalls += 1
      if (loaderCalls === 1) {
        return { title: 'old' }
      }

      return new Promise<{ title: string }>((resolve) => {
        resolveStaleReload = resolve
      })
    }

    const rootRoute = new BaseRootRoute({})
    const fooRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo',
      loader,
      head: ({ loaderData }) => {
        headCalls += 1
        if (loaderData.title === 'fresh') {
          throw new Error('head projection failed')
        }

        return {
          meta: [{ title: loaderData.title }],
        }
      },
      staleTime: 0,
      gcTime: 60_000,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([fooRoute]),
      history: createMemoryHistory(),
    })

    await router.navigate({ to: '/foo' })
    const matchId = router.state.matches.find(
      (match) => match.routeId === fooRoute.id,
    )!.id
    const getMatch = () =>
      router.state.matches.find((match) => match.id === matchId)

    expect(getMatch()?.loaderData).toEqual({ title: 'old' })
    expect(getMatch()?.meta).toEqual([{ title: 'old' }])

    await vi.advanceTimersByTimeAsync(1)
    await router.load()
    await vi.waitFor(() => expect(loaderCalls).toBe(2))
    expect(getMatch()?.isFetching).toBe('loader')

    resolveStaleReload({ title: 'fresh' })
    await vi.waitFor(() => expect(getMatch()?.isFetching).toBe(false))

    expect(headCalls).toBe(2)
    expect(getMatch()?.loaderData).toEqual({ title: 'old' })
    expect(getMatch()?.meta).toEqual([{ title: 'old' }])
  })
})
