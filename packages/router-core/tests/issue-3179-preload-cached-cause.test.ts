import { expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

// https://github.com/TanStack/router/issues/3179
test('#3179: preload flags are not inherited from the active match generation', async () => {
  const calls: Array<{
    phase: 'beforeLoad' | 'loader'
    cause: string
    preload: boolean
  }> = []
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    staleTime: 0,
    preloadStaleTime: 0,
    beforeLoad: ({ cause, preload }) => {
      calls.push({ phase: 'beforeLoad', cause, preload })
    },
    loader: ({ cause, preload }) => {
      calls.push({ phase: 'loader', cause, preload })
    },
  })
  const aboutRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/about',
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute, aboutRoute]),
    history: createMemoryHistory({ initialEntries: ['/about'] }),
  })

  await router.load()

  // First hover Home from About, then click it. This is the sequence from
  // the issue that used to cache the navigation's flags on the match.
  await router.preloadRoute({ to: '/' })
  expect(calls).toEqual([
    { phase: 'beforeLoad', cause: 'preload', preload: true },
    { phase: 'loader', cause: 'preload', preload: true },
  ])

  calls.length = 0
  await router.navigate({ to: '/' })
  expect(calls).toEqual([
    { phase: 'beforeLoad', cause: 'enter', preload: false },
    { phase: 'loader', cause: 'enter', preload: false },
  ])

  // Hover Home again while it is active. Reusing the active match must not
  // rerun callbacks with the cached { cause: 'enter', preload: false } pair.
  calls.length = 0
  await router.preloadRoute({ to: '/' })
  expect(calls).toEqual([])
})
