import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

function setup(initialEntries: Array<string> = ['/']) {
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({ getParentRoute: () => rootRoute, path: '/' })
  const aboutRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/about',
    validateSearch: (search: Record<string, unknown>) => ({
      page: search.page as number | undefined,
    }),
  })
  const contactRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/contact',
  })
  const replacedRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/replaced',
  })

  const routeTree = rootRoute.addChildren([
    indexRoute,
    aboutRoute,
    contactRoute,
    replacedRoute,
  ])

  const router = createTestRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries }),
  })

  return router
}

describe('router.getHistoryEntry - per-index entry tracking', () => {
  test('records each visited entry keyed by its __TSR_index', async () => {
    const router = setup()
    await router.load()

    expect(router.getHistoryEntry(0)).toMatchObject({ index: 0, pathname: '/' })

    await router.navigate({ to: '/about' })
    await router.navigate({ to: '/contact' })

    expect(router.getHistoryEntry(0)).toMatchObject({ pathname: '/' })
    expect(router.getHistoryEntry(1)).toMatchObject({ index: 1, pathname: '/about' })
    expect(router.getHistoryEntry(2)).toMatchObject({ index: 2, pathname: '/contact' })
  })

  test('replace reuses the same index and overwrites the entry', async () => {
    const router = setup()
    await router.load()

    await router.navigate({ to: '/about' })
    expect(router.getHistoryEntry(1)).toMatchObject({ pathname: '/about' })

    await router.navigate({ to: '/replaced', replace: true })

    // Same index, updated pathname — replace does not create a new slot.
    expect(router.latestLocation.state.__TSR_index).toBe(1)
    expect(router.getHistoryEntry(1)).toMatchObject({ index: 1, pathname: '/replaced' })
    expect(router.getHistoryEntry(2)).toBeUndefined()
  })

  test('start of history has no previous entry', async () => {
    const router = setup()
    await router.load()

    expect(router.latestLocation.state.__TSR_index).toBe(0)
    expect(router.getHistoryEntry(-1)).toBeUndefined()
  })

  test('unknown / unvisited indices return undefined', async () => {
    const router = setup()
    await router.load()

    expect(router.getHistoryEntry(99)).toBeUndefined()
    expect(router.getHistoryEntry(1)).toBeUndefined()
  })

  test('records the search string alongside the pathname', async () => {
    const router = setup()
    await router.load()

    await router.navigate({ to: '/about', search: { page: 3 } })

    const entry = router.getHistoryEntry(1)
    expect(entry).toMatchObject({ pathname: '/about' })
    expect(entry?.searchStr).toBe('?page=3')
  })

  test('the previous entry reflects the entry the user came from', async () => {
    const router = setup()
    await router.load()
    await router.navigate({ to: '/about' })
    await router.navigate({ to: '/contact' })

    const currentIndex = router.latestLocation.state.__TSR_index
    expect(currentIndex).toBe(2)
    // Going back from /contact should land on /about (index 1).
    expect(router.getHistoryEntry(currentIndex - 1)).toMatchObject({
      pathname: '/about',
    })
  })
})
