import { createMemoryHistory } from '@tanstack/history'
import { describe, expect, test } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import {
  backWithStack,
  buildLocationFromHref,
  navigateWithStack,
} from '../src/nativeNavigation'
import { createTestRouter } from './routerTestUtils'
import type { BackFn, NavigateFn } from '../src'

declare module '@tanstack/history' {
  interface HistoryState {
    testValue?: string
  }
}

async function createStackRouter() {
  const rootRoute = new BaseRootRoute({})
  const aRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/a',
  })
  const bRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/b',
  })
  const searchRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/search',
  })
  const itemRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/items/$itemId',
  })
  const history = createMemoryHistory({ initialEntries: ['/'] })
  const router = createTestRouter({
    history,
    routeTree: rootRoute.addChildren([aRoute, bRoute, searchRoute, itemRoute]),
  })

  await router.load()
  const standardNavigate = router.navigate
  router.navigate = ((options) =>
    navigateWithStack(router, options as never, standardNavigate)) as NavigateFn
  const nativeRouter = router as typeof router & { back: BackFn }
  nativeRouter.back = ((options) =>
    backWithStack(
      nativeRouter,
      options as never,
      nativeRouter.navigate,
    )) as BackFn

  return { history, router: nativeRouter }
}

describe('native stack navigation', () => {
  test('buildLocation parses direct href search and hash state', async () => {
    const { router } = await createStackRouter()

    const location = buildLocationFromHref(router, '/search?q=direct#results')

    expect(location).toMatchObject({
      pathname: '/search',
      search: { q: 'direct' },
      hash: 'results',
      href: '/search?q=direct#results',
    })
  })

  test('stack behavior overrides replace and persists entry metadata', async () => {
    const { history, router } = await createStackRouter()

    await router.navigate({
      to: '/a',
      replace: true,
      stackBehavior: 'push',
      entryId: 'a-entry',
      native: { minStackState: 'paused' },
      state: (previous) => ({ ...previous, testValue: 'preserved' }),
    })

    expect(history.location.pathname).toBe('/a')
    expect(history.location.state.__TSR_index).toBe(1)
    expect(history.location.state.__TSR_entryId).toBe('a-entry')
    expect(history.location.state.__TSR_nativeMinStackState).toBe('paused')
    expect(history.location.state.testValue).toBe('preserved')

    await router.navigate({
      to: '/b',
      replace: false,
      stackBehavior: 'replace',
      entryId: 'b-entry',
    })

    expect(history.location.pathname).toBe('/b')
    expect(history.location.state.__TSR_index).toBe(1)
    expect(history.location.state.__TSR_entryId).toBe('b-entry')
    expect(history.length).toBe(2)
  })

  test('default reuse identity includes search and hash state', async () => {
    const { history, router } = await createStackRouter()

    await router.navigate({
      href: '/search?q=one#first',
      stackBehavior: 'reuse',
    })
    await router.navigate({ to: '/a' })
    await router.navigate({
      href: '/search?q=two#second',
      stackBehavior: 'reuse',
    })

    expect(history.location.href).toBe('/search?q=two#second')
    expect(history.location.state.__TSR_index).toBe(3)

    await router.navigate({
      href: '/search?q=one#first',
      stackBehavior: 'reuse',
    })

    expect(history.location.href).toBe('/search?q=one#first')
    expect(history.location.state.__TSR_index).toBe(1)
  })

  test('reuse selects the nearest or oldest matching entry', async () => {
    const { history, router } = await createStackRouter()

    await router.navigate({
      href: '/search?q=one',
      stackBehavior: 'push',
      entryId: 'search',
    })
    await router.navigate({ to: '/a' })
    await router.navigate({
      href: '/search?q=one',
      stackBehavior: 'push',
      entryId: 'search',
    })
    await router.navigate({ to: '/b' })

    await router.navigate({
      href: '/search?q=one',
      stackBehavior: 'reuse',
      stackMatch: 'nearest',
      entryId: 'search',
    })

    expect(history.location.state.__TSR_index).toBe(3)

    await router.navigate({ to: '/b' })
    await router.navigate({
      href: '/search?q=one',
      stackBehavior: 'reuse',
      stackMatch: 'oldest',
      entryId: 'search',
    })

    expect(history.location.state.__TSR_index).toBe(1)
  })

  test('reuse replaces the current entry when its identity is unchanged', async () => {
    const { history, router } = await createStackRouter()

    await router.navigate({
      href: '/search?q=one',
      stackBehavior: 'push',
      entryId: 'search',
    })
    await router.navigate({
      href: '/search?q=two',
      stackBehavior: 'reuse',
      entryId: 'search',
    })

    expect(history.location.href).toBe('/search?q=two')
    expect(history.location.state.__TSR_index).toBe(1)
    expect(history.length).toBe(2)
  })

  test('reuse updates explicit state on the current entry', async () => {
    const { history, router } = await createStackRouter()

    await router.navigate({
      href: '/search?q=one',
      stackBehavior: 'push',
      entryId: 'search',
      state: { testValue: 'first' },
    })
    await router.navigate({
      href: '/search?q=one',
      stackBehavior: 'reuse',
      entryId: 'search',
      state: { testValue: 'second' },
    })

    expect(history.location.state.__TSR_index).toBe(1)
    expect(history.location.state.testValue).toBe('second')
    expect(history.length).toBe(2)
  })

  test('a push after going back starts a clean history branch', async () => {
    const { history, router } = await createStackRouter()

    await router.navigate({ to: '/a', entryId: 'a' })
    await router.navigate({ to: '/b', entryId: 'b' })
    await router.navigate({ to: '/search', entryId: 'search' })
    await router.back({ steps: 2 })
    await router.navigate({
      to: '/items/$itemId',
      params: { itemId: 'one' },
      entryId: 'item',
    })

    expect(history.length).toBe(3)
    history.forward()
    expect(history.location.pathname).toBe('/items/one')

    await router.navigate({
      to: '/search',
      stackBehavior: 'reuse',
      entryId: 'search',
    })

    expect(history.location.pathname).toBe('/search')
    expect(history.location.state.__TSR_index).toBe(3)
  })

  test('back supports steps, root, and route targets', async () => {
    const { history, router } = await createStackRouter()

    await router.navigate({ to: '/a' })
    await router.navigate({ href: '/search?q=one' })
    await router.navigate({ to: '/b' })

    await router.back({ steps: 2 })
    expect(history.location.pathname).toBe('/a')

    await router.navigate({ href: '/search?q=two' })
    await router.navigate({ to: '/b' })
    await router.back({ to: '/search' })
    expect(history.location.href).toBe('/search?q=two')

    await router.back({ to: 'root' })
    expect(history.location.pathname).toBe('/')
    expect(history.location.state.__TSR_index).toBe(0)
  })

  test('back waits for an asynchronous history pop and route load', async () => {
    const { history, router } = await createStackRouter()
    await router.navigate({ to: '/a' })
    await router.navigate({ to: '/b' })

    const go = history.go.bind(history)
    history.go = (delta, options) => {
      setTimeout(() => go(delta, options), 10)
    }

    const navigation = router.back()
    expect(router.state.location.pathname).toBe('/b')

    await navigation

    expect(history.location.pathname).toBe('/a')
    expect(router.state.location.pathname).toBe('/a')
  })

  test('back can target an explicit stack identity', async () => {
    const { history, router } = await createStackRouter()

    await router.navigate({
      href: '/search?q=oldest',
      entryId: 'oldest-search',
    })
    await router.navigate({ to: '/a' })
    await router.navigate({ href: '/search?q=nearest', entryId: 'search' })
    await router.navigate({ to: '/b' })

    await router.back({
      to: '/search',
      entryId: 'oldest-search',
    })

    expect(history.location.href).toBe('/search?q=oldest')
  })

  test('back applies push, replace, and noop fallback policies', async () => {
    const pushHarness = await createStackRouter()
    await pushHarness.router.back({
      to: '/a',
      entryId: 'missing-a',
      ifMissing: 'push',
    })
    expect(pushHarness.history.location.pathname).toBe('/a')
    expect(pushHarness.history.location.state.__TSR_index).toBe(1)
    expect(pushHarness.history.location.state.__TSR_entryId).toBe('missing-a')

    const replaceHarness = await createStackRouter()
    await replaceHarness.router.back({
      to: '/a',
      entryId: 'replacement-a',
      ifMissing: 'replace',
    })
    expect(replaceHarness.history.location.pathname).toBe('/a')
    expect(replaceHarness.history.location.state.__TSR_index).toBe(0)
    expect(replaceHarness.history.location.state.__TSR_entryId).toBe(
      'replacement-a',
    )

    const noopHarness = await createStackRouter()
    await noopHarness.router.back({ to: '/a', ifMissing: 'noop' })
    expect(noopHarness.history.location.pathname).toBe('/')
    expect(noopHarness.history.length).toBe(1)
  })

  test('back validates step counts', async () => {
    const { router } = await createStackRouter()

    await expect(router.back({ steps: 0 })).rejects.toThrow(RangeError)
    await expect(router.back({ steps: Number.NaN })).rejects.toThrow(RangeError)
  })
})
