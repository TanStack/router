import { createMemoryHistory } from '@tanstack/history'
import { describe, expect, test } from 'vitest'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  notFound,
} from '../src'
import { createTestRouter } from './routerTestUtils'

// https://github.com/TanStack/router/issues/6221
describe('issue #6221: head does not run before loader data is ready', () => {
  test('existing-behavior control: head sees fresh loaderData after a notFound visit', async () => {
    let authed = false
    const articleResponse = createControlledPromise<{ title: string }>()
    const successfulLoadStarted = createControlledPromise<void>()

    const articleLoader = async () => {
      if (!authed) {
        await Promise.resolve()
        throw notFound()
      }

      successfulLoadStarted.resolve()
      return articleResponse
    }

    const rootRoute = new BaseRootRoute({})
    const dashboardRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/dashboard',
    })
    const articleRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/article',
      loader: articleLoader,
      notFoundComponent: () => 'Not found',
      head: ({ loaderData }) => ({
        meta: [{ title: loaderData?.title ?? 'Generic title' }],
      }),
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([dashboardRoute, articleRoute]),
      history: createMemoryHistory({ initialEntries: ['/article'] }),
    })
    const backLoadFinished = createControlledPromise<void>()
    let backLoadStarted = false
    let unsubscribe: (() => void) | undefined

    try {
      await router.load()
      const notFoundMatch = router.state.matches.find(
        (match) => match.routeId === articleRoute.id,
      )
      expect(notFoundMatch?.status).toBe('notFound')
      expect(notFoundMatch?.meta).toEqual([{ title: 'Generic title' }])

      // Model the reported auth redirect and browser Back without relying on a
      // wall-clock loader delay.
      authed = true
      await router.navigate({ to: '/dashboard' })
      unsubscribe = router.history.subscribe(() => {
        backLoadStarted = true
        void router.load().then(
          () => backLoadFinished.resolve(),
          (error) => backLoadFinished.reject(error),
        )
      })
      router.history.back()
      await successfulLoadStarted
      expect(articleResponse.status).toBe('pending')

      articleResponse.resolve({ title: 'Article 123' })
      await backLoadFinished

      const articleMatch = router.state.matches.find(
        (match) => match.routeId === articleRoute.id,
      )
      expect(articleMatch?.status).toBe('success')
      expect(articleMatch?.loaderData).toEqual({ title: 'Article 123' })
      expect(articleMatch?.meta).toEqual([{ title: 'Article 123' }])
    } finally {
      articleResponse.resolve({ title: 'Article 123' })
      if (backLoadStarted) {
        await backLoadFinished.catch(() => undefined)
      }
      unsubscribe?.()
    }
  })
})
