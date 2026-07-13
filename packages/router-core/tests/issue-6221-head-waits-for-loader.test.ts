import { createMemoryHistory } from '@tanstack/history'
import { describe, expect, test, vi } from 'vitest'
import { BaseRootRoute, BaseRoute, notFound } from '../src'
import { createTestRouter } from './routerTestUtils'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// https://github.com/TanStack/router/issues/6221
//
// head() must never compute from loaderData older than the data the lane
// commits. Two reported shapes:
// 1. Revisiting a route whose previous visit ended in notFound — the head
//    must see the fresh successful loaderData, not run before the loader.
// 2. Revisiting a cached success match that gets a stale reload — the head
//    title must not lag one loaderData run behind.
describe('issue #6221: head does not run before loader data is ready', () => {
  test('head sees fresh loaderData when a previously-notFound route loads successfully', async () => {
    let authed = false
    const headLoaderData: Array<unknown> = []

    const articleLoader = vi.fn(async () => {
      await sleep(5)
      if (!authed) throw notFound()
      return { title: 'Article 123' }
    })

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const articleRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/article',
      loader: articleLoader,
      notFoundComponent: () => 'Not found',
      head: ({ loaderData }) => {
        headLoaderData.push(loaderData)
        return {
          meta: [{ title: (loaderData as any)?.title ?? 'Generic title' }],
        }
      },
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, articleRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    // Logged out: the article loader throws notFound.
    await router.navigate({ to: '/article' })
    const notFoundMatch = router.state.matches.find(
      (match) => match.routeId === articleRoute.id,
    )
    expect(notFoundMatch?.status).toBe('notFound')

    // Log in, go elsewhere, then come back (the issue's back-button step).
    authed = true
    await router.navigate({ to: '/' })
    await router.navigate({ to: '/article' })

    await vi.waitFor(() => {
      const articleMatch = router.state.matches.find(
        (match) => match.routeId === articleRoute.id,
      )
      expect(articleMatch?.status).toBe('success')
      expect(articleMatch?.meta).toEqual([{ title: 'Article 123' }])
    })

    // The head executed for the successful lane saw the fresh loaderData.
    expect(headLoaderData[headLoaderData.length - 1]).toEqual({
      title: 'Article 123',
    })
  })

  test('head title does not lag one loaderData run behind on revisits', async () => {
    let version = 0
    const quoteLoader = vi.fn(async () => {
      await sleep(5)
      version += 1
      return { author: `author-${version}` }
    })

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const quoteRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/quote',
      loader: quoteLoader,
      head: ({ loaderData }) => ({
        meta: [{ title: `Quote by ${(loaderData as any)?.author ?? '...'}` }],
      }),
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, quoteRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    await router.navigate({ to: '/quote' })
    await vi.waitFor(() => {
      const quoteMatch = router.state.matches.find(
        (match) => match.routeId === quoteRoute.id,
      )
      expect(quoteMatch?.meta).toEqual([{ title: 'Quote by author-1' }])
    })

    await router.navigate({ to: '/' })
    await router.navigate({ to: '/quote' })

    // The revisit reloads the stale match. Whether that reload is foreground
    // or background, the committed head must reflect the loaderData it was
    // committed with — never the previous run's data.
    await vi.waitFor(() => {
      expect(quoteLoader).toHaveBeenCalledTimes(2)
      const quoteMatch = router.state.matches.find(
        (match) => match.routeId === quoteRoute.id,
      )
      expect(quoteMatch?.loaderData).toEqual({ author: 'author-2' })
      expect(quoteMatch?.meta).toEqual([{ title: 'Quote by author-2' }])
    })
  })
})
