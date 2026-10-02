import { expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, defaultParseSearch } from '../src'
import { createTestRouter } from './routerTestUtils'

function setup() {
  const root = new BaseRootRoute({})
  const item = new BaseRoute({
    getParentRoute: () => root,
    path: '/items/$id',
  })
  return createTestRouter({
    routeTree: root.addChildren([item]),
    history: createMemoryHistory({ initialEntries: ['/items/source?page=1'] }),
    isServer: false,
  })
}

test('evaluates search against each source for a fixed pathname', () => {
  const router = setup()
  const source = router.latestLocation
  const search = vi.fn((prev: any) => ({ page: prev.page + 1 }))
  const destination = {
    to: '/items/$id',
    params: { id: 'target' },
    search,
    _fromLocation: source,
  }
  expect(router.buildLocation(destination).href).toBe('/items/target?page=2')
  router.history.push('/items/source?page=7')
  router.updateLatestLocation()
  destination._fromLocation = router.latestLocation
  expect(router.buildLocation(destination).href).toBe('/items/target?page=8')
  expect(search).toHaveBeenCalledTimes(2)
})

test('evaluates params callbacks against each source', () => {
  const router = setup()
  const source = router.latestLocation
  const params = vi.fn((prev: any) => ({ id: `${prev.id}-next` }))
  const destination = {
    to: '/items/$id',
    params,
    search: (prev: any) => prev,
    _fromLocation: source,
  }
  expect(router.buildLocation(destination).href).toBe(
    '/items/source-next?page=1',
  )
  router.history.push('/items/second?page=1')
  router.updateLatestLocation()
  destination._fromLocation = router.latestLocation
  expect(router.buildLocation(destination).href).toBe(
    '/items/second-next?page=1',
  )
  expect(params).toHaveBeenCalledTimes(2)
})

test('a params updater can update search middleware before the destination search builds', () => {
  const root = new BaseRootRoute({})
  const item = new BaseRoute({
    getParentRoute: () => root,
    path: '/items/$id',
  })
  const router = createTestRouter({
    routeTree: root.addChildren([item]),
    history: createMemoryHistory({ initialEntries: ['/items/source'] }),
  })
  const result = router.buildLocation({
    to: '/items/$id',
    params: () => {
      item.update({
        search: {
          middlewares: [
            ({ search, next }) => ({ ...next(search), added: 'yes' }),
          ],
        },
      })
      return { id: 'target' }
    },
    search: {},
  })
  expect(result.href).toBe('/items/target?added=yes')
})

test('destination and mask use the same captured source after a callback updates history', () => {
  const router = setup()
  const result = router.buildLocation({
    to: '/items/$id',
    params: { id: 'target' },
    search: (prev: any) => {
      router.history.push('/items/second?page=7#second')
      router.updateLatestLocation()
      return prev
    },
    mask: { to: '/items/$id', params: true, search: true },
  })
  expect(result.href).toBe('/items/target?page=1')
  expect(result.maskedLocation?.href).toBe('/items/source?page=1')
})

test('href parsing callbacks preserve the original source for destination state and mask inheritance', async () => {
  const router = setup()
  router.history.replace('/items/source?page=1', { user: 'original' })
  await router.load()
  expect(router.state.location.href).toBe('/items/source?page=1')
  expect(router.state.location.state).toMatchObject({ user: 'original' })
  const stop = router.history.subscribe(() => {
    void router.load()
  })
  let updateHistory = false
  let reentrantNavigation: Promise<void> | undefined
  let interveningHref: string | undefined
  try {
    router.update({
      parseSearch: (search) => {
        if (updateHistory) {
          updateHistory = false
          reentrantNavigation = router.navigate({
            to: '/items/$id',
            params: { id: 'second' },
            search: { page: 7 },
            state: (previous) => ({ ...previous, user: 'changed' }),
          })
          interveningHref = router.history.location.href
        }
        return defaultParseSearch(search)
      },
    })
    updateHistory = true
    const navigation = router.navigate({
      href: '/items/target?fresh=1',
      state: true,
      mask: {
        to: '/items/$id',
        params: true,
        search: true,
        state: true,
      },
    })
    await Promise.all([navigation, reentrantNavigation])
    expect(reentrantNavigation).toBeDefined()
    expect(interveningHref).toBe('/items/second?page=7')
    expect(router.state.location.href).toBe('/items/target?fresh=1')
    expect(router.state.location.state).toMatchObject({ user: 'original' })
    expect(router.state.matches.at(-1)?.params).toEqual({ id: 'target' })
    expect(router.state.location.maskedLocation?.href).toBe(
      '/items/source?page=1',
    )
    expect(router.state.location.maskedLocation?.state).toMatchObject({
      user: 'original',
    })
    expect(router.history.location.href).toBe('/items/source?page=1')
    expect(router.history.location.state).toMatchObject({ user: 'original' })
  } finally {
    stop()
    router.history.destroy()
  }
})

test('a fixed destination continues to evaluate inherited mask params and search', () => {
  const router = setup()
  const destination = {
    to: '/items/$id',
    params: { id: 'target' },
    search: (prev: any) => prev,
    mask: { to: '/items/$id', params: true as const, search: true as const },
    _fromLocation: router.latestLocation,
  }
  expect(router.buildLocation(destination).maskedLocation?.href).toBe(
    '/items/source?page=1',
  )
  router.history.push('/items/second?page=7')
  router.updateLatestLocation()
  destination._fromLocation = router.latestLocation
  const result = router.buildLocation(destination)
  expect(result.href).toBe('/items/target?page=7')
  expect(result.maskedLocation?.href).toBe('/items/second?page=7')
})

test('URL configuration updates invalidate preparation', () => {
  const router = setup()
  const destination = {
    to: '/items/$id',
    params: { id: 'target' },
    search: (prev: any) => prev,
    _fromLocation: router.latestLocation,
  }
  expect(router.buildLocation(destination).href).toBe('/items/target?page=1')
  router.update({ trailingSlash: 'always' as any })
  expect(router.buildLocation(destination).href).toBe('/items/target/?page=1')
})

test('a reentrant configuration update cannot install an obsolete complete location', () => {
  const router = setup()
  let update = false
  const destination = {
    to: '/items/$id',
    params: { id: 'target' },
    _fromLocation: router.latestLocation,
  }
  router.update({
    stringifySearch: () => {
      if (update) {
        update = false
        router.update({ trailingSlash: 'always' as any })
      }
      return ''
    },
  })
  update = true
  expect(router.buildLocation(destination).href).toBe('/items/target')
  expect(router.buildLocation(destination).href).toBe('/items/target/')
})
