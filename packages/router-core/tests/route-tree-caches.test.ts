import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import * as pathUtils from '../src/path'
import * as routeTreeUtils from '../src/new-process-route-tree'
import { createRequestHandler } from '../src/ssr/createRequestHandler'
import { createTestRouter } from './routerTestUtils'
import type { AnyRoute, AnyRouter } from '../src'

const disposers: Array<() => void> = []

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubGlobal('__TSR_CACHE__', undefined)
})

afterEach(() => {
  for (const dispose of disposers.splice(0)) {
    dispose()
  }
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

function createRoutes() {
  const root = new BaseRootRoute({})
  const item = new BaseRoute({
    getParentRoute: () => root,
    path: '/items/$id',
  })
  return { root, item, routeTree: root.addChildren([item]) }
}

function history() {
  const result = createMemoryHistory({ initialEntries: ['/'] })
  disposers.push(result.destroy)
  return result
}

test.each([false, true])(
  'caches the canonical pathname without changing hrefs (server: %s)',
  (isServer) => {
    const { routeTree, item } = createRoutes()
    const router = createTestRouter({ routeTree, history: history(), isServer })
    for (const [id, pathname, href] of [
      ['one two', '/items/one two', '/items/one%20two'],
      ['caf\u00e9', '/items/caf\u00e9', '/items/caf%C3%A9'],
      ['a/b', '/items/a%2Fb', '/items/a%2Fb'],
      ['%2F', '/items/%252F', '/items/%252F'],
      ['a\\b', '/items/a%5Cb', '/items/a%5Cb'],
      ['a?b#c', '/items/a%3Fb%23c', '/items/a%3Fb%23c'],
      ['a\tb', '/items/a%09b', '/items/a%09b'],
    ] as const) {
      for (let repeat = 0; repeat < 2; repeat++) {
        const result = router.buildLocation({
          to: '/items/$id',
          params: { id },
        })
        expect(result.pathname).toBe(pathname)
        expect(result.href).toBe(href)
        expect(item._pathCache?.[0 /* paths */].get(id)).toBe(pathname)
      }
    }
  },
)

test('reuses server caches after request cleanup without sharing match state', async () => {
  const { routeTree, item, root } = createRoutes()
  const routers: Array<AnyRouter> = []
  const request = () =>
    createRequestHandler({
      request: new Request('http://localhost/'),
      createRouter: () => {
        const router = createTestRouter({ routeTree, isServer: true })
        routers.push(router)
        return router
      },
    })(({ router }) => {
      disposers.push(router.history.destroy)
      router.buildLocation({
        to: '/pretty/$id',
        params: { id: 'one two' },
      })
      return new Response(
        router.buildLocation({
          to: '/items/$id',
          params: { id: 'one two' },
        }).href,
      )
    })

  expect(await (await request()).text()).toBe('/items/one%20two')
  const branch = item._branch
  const plan = item._pathCache
  const firstLocation = routers[0]!.latestLocation
  const lightweightResult = routers[0]!['lightweightCache'].get(firstLocation)
  expect(branch).toEqual([root, item])
  expect(plan).toBeDefined()
  expect(lightweightResult).toBeDefined()
  const interpolate = vi.spyOn(pathUtils, 'interpolatePath')

  expect(await (await request()).text()).toBe('/items/one%20two')
  expect(item._branch).toBe(branch)
  expect(item._pathCache).toBe(plan)
  expect(
    interpolate.mock.calls.filter(([path]) => path === '/items/$id'),
  ).toHaveLength(0)
  expect(
    interpolate.mock.calls.filter(([path]) => path === '/pretty/$id'),
  ).toHaveLength(0)
  expect(routers[0]).not.toBe(routers[1])
  expect(routers[0]!.resolvePathCache).toBe(routers[1]!.resolvePathCache)
  expect(routers[0]!['unmatchedPathCache']).toBe(
    routers[1]!['unmatchedPathCache'],
  )
  expect(routers[0]!['lightweightCache']).not.toBe(
    routers[1]!['lightweightCache'],
  )
  expect(routers[1]!['lightweightCache'].get(firstLocation)).toBeUndefined()
  expect(routers[1]!.latestLocation).not.toBe(firstLocation)
  expect(routers[0]!._cache).not.toBe(routers[1]!._cache)
})

test.each([
  { mode: 'production', isServer: false },
  { mode: 'development', isServer: true },
])(
  'does not share router cache groups in $mode (server: $isServer)',
  ({ mode, isServer }) => {
    vi.stubEnv('NODE_ENV', mode)
    const first = createTestRouter({
      routeTree: createRoutes().routeTree,
      history: history(),
      isServer,
    })
    const second = createTestRouter({
      routeTree: createRoutes().routeTree,
      history: history(),
      isServer,
    })
    expect(first.resolvePathCache).not.toBe(second.resolvePathCache)
    expect(first['unmatchedPathCache']).not.toBe(second['unmatchedPathCache'])
    expect(first['lightweightCache']).not.toBe(second['lightweightCache'])
    expect(globalThis.__TSR_CACHE__).toBeUndefined()
  },
)

test('keeps different route objects independent and resets derived caches when rebuilding', () => {
  vi.stubEnv('NODE_ENV', 'development')
  const firstTree = createRoutes()
  const secondTree = createRoutes()
  const first = createTestRouter({
    routeTree: firstTree.routeTree,
    history: history(),
  })
  const second = createTestRouter({
    routeTree: secondTree.routeTree,
    history: history(),
  })
  for (const router of [first, second]) {
    expect(
      router.buildLocation({ to: '/items/$id', params: { id: 'one' } }).href,
    ).toBe('/items/one')
  }
  expect(firstTree.item._branch).not.toBe(secondTree.item._branch)
  expect(firstTree.item._pathCache).not.toBe(secondTree.item._pathCache)
  expect(firstTree.item._interpolation).not.toBe(secondTree.item._interpolation)

  const previousResolve = first.resolvePathCache
  const previousFallback = first['unmatchedPathCache']
  const previousLightweight = first['lightweightCache']
  const previousBranch = firstTree.item._branch
  const previousPlan = firstTree.item._pathCache
  const previousInterpolation = firstTree.item._interpolation
  first.setRoutes(first.buildRouteTree())
  expect(first.resolvePathCache).not.toBe(previousResolve)
  expect(first['unmatchedPathCache']).not.toBe(previousFallback)
  expect(first['lightweightCache']).not.toBe(previousLightweight)
  expect(firstTree.item._branch).toBeUndefined()
  expect(firstTree.item._pathCache).toBe(previousPlan)
  expect(firstTree.item._interpolation).not.toBe(previousInterpolation)
  expect([...firstTree.item._interpolation!]).toEqual([
    ...previousInterpolation!,
  ])
  expect(
    first.buildLocation({ to: '/items/$id', params: { id: 'one' } }).href,
  ).toBe('/items/one')
  expect(firstTree.item._branch).not.toBe(previousBranch)
  expect(firstTree.item._pathCache).toBe(previousPlan)
})

test('keeps more than 32 registered route templates warm', () => {
  const root = new BaseRootRoute({})
  const routes = Array.from(
    { length: 128 },
    (_, index) =>
      new BaseRoute({
        getParentRoute: () => root,
        path: `/section-${index}/$id`,
      }),
  )
  const router = createTestRouter({
    routeTree: root.addChildren(routes),
    history: history(),
    pathParamsAllowedCharacters: ['@'],
  })
  const interpolate = vi.spyOn(pathUtils, 'interpolatePath')
  for (let round = 0; round < 2; round++) {
    for (let index = 0; index < routes.length; index++) {
      expect(
        router.buildLocation({
          to: `/section-${index}/$id`,
          params: { id: '@one' },
        }).pathname,
      ).toBe(`/section-${index}/@one`)
    }
    expect(interpolate).toHaveBeenCalledTimes(routes.length)
  }
})

test('refreshes branches and path plans when an existing route is reparented', () => {
  vi.stubEnv('NODE_ENV', 'development')
  const root = new BaseRootRoute({})
  const left = new BaseRoute({ getParentRoute: () => root, path: '/left' })
  const right = new BaseRoute({ getParentRoute: () => root, path: '/right' })
  let parent: AnyRoute = left
  const child = new BaseRoute({
    getParentRoute: () => parent,
    path: '/child/$id',
  })
  const router = createTestRouter({
    routeTree: root.addChildren([left.addChildren([child]), right]),
    history: history(),
  })
  expect(
    router.buildLocation({ to: '/left/child/$id', params: { id: 'one two' } })
      .href,
  ).toBe('/left/child/one%20two')
  expect(child._branch).toEqual([root, left, child])
  const plan = child._pathCache
  const previousInterpolation = child._interpolation

  parent = right
  left.addChildren([])
  right.addChildren([child])
  router.setRoutes(router.buildRouteTree())
  expect(child._branch).toBeUndefined()
  expect(child._pathCache).toBe(plan)
  expect(child._interpolation).not.toBe(previousInterpolation)
  expect(child.fullPath).toBe('/right/child/$id')
  expect(child._interpolation?.[0]).toBe('/right/child')
  const parse = vi.spyOn(routeTreeUtils, 'parseSegments')
  expect(
    router.buildLocation({ to: '/right/child/$id', params: { id: 'one two' } })
      .href,
  ).toBe('/right/child/one%20two')
  expect(child._branch).toEqual([root, right, child])
  expect(child._pathCache).not.toBe(plan)
  expect(parse).not.toHaveBeenCalled()
})

test('uses updated callbacks with rebuilt segments in development', () => {
  vi.stubEnv('NODE_ENV', 'development')
  const { routeTree, item } = createRoutes()
  const router = createTestRouter({ routeTree, history: history() })
  expect(
    router.buildLocation({ to: '/items/$id', params: { id: 'one' } }).href,
  ).toBe('/items/one')
  const prepared = item._interpolation
  item.options.params = {
    stringify: ({ id }) => ({ id: `updated ${id}` }),
  }
  router.setRoutes(router.buildRouteTree())
  expect(item._interpolation).not.toBe(prepared)
  const parse = vi.spyOn(routeTreeUtils, 'parseSegments')
  expect(
    router.buildLocation({ to: '/items/$id', params: { id: 'one' } }).href,
  ).toBe('/items/updated%20one')
  expect(parse).not.toHaveBeenCalled()
})

test('keeps the 128-result bound within each route', () => {
  const { routeTree } = createRoutes()
  const router = createTestRouter({
    routeTree,
    history: history(),
    pathParamsAllowedCharacters: ['@'],
  })
  const interpolate = vi.spyOn(pathUtils, 'interpolatePath')
  for (let id = 0; id <= 128; id++) {
    expect(
      router.buildLocation({
        to: '/items/$id',
        params: { id: `@${id}` },
      }).pathname,
    ).toBe(`/items/@${id}`)
  }
  interpolate.mockClear()
  expect(
    router.buildLocation({ to: '/items/$id', params: { id: '@0' } }).pathname,
  ).toBe('/items/@0')
  expect(interpolate).toHaveBeenCalledOnce()
})

test('uses fixed encodings and trailing-slash policies on independent routes', () => {
  const allowAt = createTestRouter({
    routeTree: createRoutes().routeTree,
    history: history(),
    isServer: true,
    trailingSlash: 'never',
    pathParamsAllowedCharacters: ['@'],
  })
  const allowPlus = createTestRouter({
    routeTree: createRoutes().routeTree,
    history: history(),
    isServer: true,
    trailingSlash: 'always',
    pathParamsAllowedCharacters: ['+'],
  })
  for (let round = 0; round < 3; round++) {
    expect(
      allowAt.buildLocation({ to: '/items/$id', params: { id: '@+' } })
        .pathname,
    ).toBe('/items/@%2B')
    expect(
      allowPlus.buildLocation({ to: '/items/$id', params: { id: '@+' } })
        .pathname,
    ).toBe('/items/%40+/')
  }
  const allowAtWithSlash = createTestRouter({
    routeTree: createRoutes().routeTree,
    history: history(),
    isServer: true,
    trailingSlash: 'always',
    pathParamsAllowedCharacters: ['@'],
  })
  expect(
    allowAtWithSlash.buildLocation({ to: '/items/$id', params: { id: '@+' } })
      .pathname,
  ).toBe('/items/@%2B/')
  expect(
    allowAt.buildLocation({ to: '/items/$id', params: { id: '@+' } }).pathname,
  ).toBe('/items/@%2B')
})

test('parses unregistered templates once per immutable router', () => {
  const parse = vi.spyOn(routeTreeUtils, 'parseSegments')
  for (const allowed of [undefined, ['@'], ['+']] as const) {
    const router = createTestRouter({
      routeTree: createRoutes().routeTree,
      history: history(),
      pathParamsAllowedCharacters: allowed,
    })
    for (let id = 0; id < 140; id++) {
      expect(
        router.buildLocation({
          to: '/unregistered/$id',
          params: { id: String(id) },
        }).pathname,
      ).toBe(`/unregistered/${id}`)
    }
  }
  expect(parse).toHaveBeenCalledTimes(3)
})

test('keeps client-local template caches independent of other fixed encodings', () => {
  const first = createTestRouter({
    routeTree: createRoutes().routeTree,
    history: history(),
    isServer: false,
    pathParamsAllowedCharacters: ['@'],
  })
  const second = createTestRouter({
    routeTree: createRoutes().routeTree,
    history: history(),
    isServer: false,
    pathParamsAllowedCharacters: ['+'],
  })
  const destination = { to: '/unregistered/$id', params: { id: '@+' } }
  expect(first.buildLocation(destination).pathname).toBe('/unregistered/@%2B')
  expect(
    second.buildLocation({ to: '/items/$id', params: { id: '@+' } }).pathname,
  ).toBe('/items/%40+')
  expect(second.buildLocation(destination).pathname).toBe('/unregistered/%40+')
  const interpolate = vi.spyOn(pathUtils, 'interpolatePath')
  expect(first.buildLocation(destination).pathname).toBe('/unregistered/@%2B')
  expect(interpolate).not.toHaveBeenCalled()
})

test('does not reparse a legacy fallback already registered in the tree', () => {
  const { routeTree, item } = createRoutes()
  const parse = vi.spyOn(routeTreeUtils, 'parseSegments')
  const router = createTestRouter({
    routeTree,
    notFoundRoute: item,
    history: history(),
  })
  expect(router.routesById[item.id]).toBe(item)
  expect(item._interpolation).toBeDefined()
  expect(parse).not.toHaveBeenCalled()
})

test('retains a bounded fallback for unregistered mask templates', () => {
  const { routeTree } = createRoutes()
  const router = createTestRouter({
    routeTree,
    history: history(),
    pathParamsAllowedCharacters: ['@'],
  })
  const interpolate = vi.spyOn(pathUtils, 'interpolatePath')
  const build = () =>
    router.buildLocation({
      to: '/items/$id',
      params: { id: '@one' },
      mask: { to: '/pretty/$id', params: { id: '@one' } },
    })

  expect(build().maskedLocation?.pathname).toBe('/pretty/@one')
  interpolate.mockClear()
  expect(build().maskedLocation?.pathname).toBe('/pretty/@one')
  expect(interpolate).not.toHaveBeenCalled()

  const templates = Array.from(
    { length: 64 },
    (_, index) => `/unregistered-${index}/$id`,
  )
  for (const to of templates) {
    router.buildLocation({
      to,
      params: { id: '@one' },
    })
  }
  const cache = router['unmatchedPathCache']
  expect(
    ['/pretty/$id', ...templates].filter((path) => cache.get(path)),
  ).toHaveLength(32)
  const evicted = templates.find((path) => !cache.get(path))!
  expect(evicted).toBeDefined()
  interpolate.mockClear()
  expect(
    router.buildLocation({ to: evicted, params: { id: '@one' } }).pathname,
  ).toBe(evicted.replace('$id', '@one'))
  expect(interpolate).toHaveBeenCalledOnce()
})
