import { expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, redirect } from '../src'
import { createTestRouter } from './routerTestUtils'

test('P09: preload redirect depth permits exactly twenty follows', async () => {
  const visited: Array<number> = []
  let successAt = 20

  const rootRoute = new BaseRootRoute({})
  const stepRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/step/$step',
    loader: ({ params, preload }) => {
      const step = Number(params.step)
      if (preload) {
        visited.push(step)
        if (step < successAt) {
          throw redirect({
            to: '/step/$step',
            params: { step: String(step + 1) },
          })
        }
      }
      return { step }
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([stepRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  await router.load()
  const withinLimit = await router.preloadRoute({
    to: '/step/$step',
    params: { step: '0' },
  })
  expect(visited).toEqual(Array.from({ length: 21 }, (_, index) => index))
  expect(withinLimit?.at(-1)?.loaderData).toEqual({ step: 20 })

  router.clearCache()
  visited.length = 0
  successAt = 21
  const beyondLimit = await router.preloadRoute({
    to: '/step/$step',
    params: { step: '0' },
  })
  expect(visited).toEqual(Array.from({ length: 21 }, (_, index) => index))
  expect(beyondLimit).toBeUndefined()
})
