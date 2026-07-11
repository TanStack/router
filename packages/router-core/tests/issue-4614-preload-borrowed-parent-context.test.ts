import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * Issue #4614 (selective SSR + intent preload) — unit-level analogue.
 *
 * After hydration the root match's committed beforeLoad context comes from
 * the server run. A hover preload borrows that active root match, so a
 * preloaded child's beforeLoad receives the root's committed context and
 * the root beforeLoad is NOT re-run by the preload. Only a real navigation
 * re-runs the root beforeLoad and refreshes the derived context.
 *
 * This pins the borrowing semantics: the inconsistency reported in #4614
 * (root re-running with fresh context on hover while the child still saw
 * the stale one) cannot happen because borrowed ancestors do not re-run at
 * all during preloads. Whether dehydrated beforeLoad context should be
 * recomputed client-side for selective-SSR trees is a separate Start
 * design question tracked on the issue.
 */

test('preload borrows the active parent: no beforeLoad re-run, committed context flows to the child', async () => {
  let env = 'server'
  const seen: Array<{ env: unknown; preload: boolean }> = []

  const rootBeforeLoad = vi.fn(() => ({ env }))
  const rootRoute = new BaseRootRoute({ beforeLoad: rootBeforeLoad })
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const testRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/test',
    beforeLoad: ({ context, preload }) => {
      seen.push({ env: (context as any).env, preload })
    },
  })

  const router = createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute, testRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  expect(rootBeforeLoad).toHaveBeenCalledTimes(1)

  // The environment feeding the root's beforeLoad changes after the first
  // load (in #4614: server -> client across the hydration boundary).
  env = 'client'

  // Hover preload: the active root match is borrowed read-only. Its
  // beforeLoad must not re-run, and the child consistently receives the
  // root's committed context.
  await router.preloadRoute({ to: '/test' } as any)
  expect(rootBeforeLoad).toHaveBeenCalledTimes(1)
  expect(seen).toEqual([{ env: 'server', preload: true }])

  // A real navigation re-runs the root beforeLoad and refreshes the
  // context seen by the child.
  await router.navigate({ to: '/test' } as any)
  await router.latestLoadPromise
  expect(rootBeforeLoad).toHaveBeenCalledTimes(2)
  expect(seen[seen.length - 1]).toEqual({ env: 'client', preload: false })
})
