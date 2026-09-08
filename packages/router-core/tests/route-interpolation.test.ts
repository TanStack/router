import { afterEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { compileDecodeCharMap, interpolatePath, parseInterpolationPath } from '../src/path'
import * as routeTree from '../src/new-process-route-tree'
import { createTestRouter, interpolateTestPath } from './routerTestUtils'

afterEach(() => vi.restoreAllMocks())

describe.each([false, true])(
  'prepared route interpolation (server: %s)',
  (server) => {
    test.each([
      '/',
      '/static/path/',
      '/items/$id',
      '/$id/$id/',
      '/items/Pre{$id}Suffix/{-$lang}',
      '/items/Pre{-$id}Suffix/$lang',
      '/files/$',
      '/files/Pre{$}Suffix/',
      '/files/$/child',
      '/{-$lang}/files/{$}.txt',
      '//items//$id//',
      '/literal$dollar/{$id}/',
    ])('keeps substitution and metadata live for %s', (path) => {
      const root = new BaseRootRoute({})
      const route = new BaseRoute({ getParentRoute: () => root, path })
      const history = createMemoryHistory({ initialEntries: ['/'] })
      createTestRouter({
        routeTree: root.addChildren([route]),
        history,
        isServer: server,
        scrollRestoration: false,
      })
      history.destroy()
      const inputs: Array<Record<string, unknown>> = [
        {},
        { id: '', lang: null, _splat: '' },
        { id: 'one /@+?', lang: 'en', _splat: 'docs/a b/100%' },
        { id: 0, lang: false, _splat: 0 },
        { id: 'next', lang: undefined, _splat: 'next/file' },
      ]
      for (const params of [...inputs, ...inputs]) {
        const expectedUsed = Object.create(null)
        const actualUsed = Object.create(null)
        const expectedKeys: Array<string> = []
        const actualKeys = (route._interpolation ?? []).flatMap((part) =>
          typeof part === 'string' ? [] : [part[1]],
        )
        const expectedMeta = { isMissingParams: false }
        const actualMeta = { isMissingParams: false }
        const decoder = compileDecodeCharMap(['@', '+'])
        const expected = interpolateTestPath(
          path,
          params,
          decoder,
          expectedUsed,
          expectedKeys,
          expectedMeta,
        )
        expect(
          route._interpolation
            ? interpolatePath(
                path,
                route._interpolation,
                params,
                decoder,
                actualUsed,
                actualMeta,
              )
            : path,
        ).toBe(expected)
        expect(actualUsed).toEqual(expectedUsed)
        expect(actualKeys).toEqual(expectedKeys)
        expect(actualMeta).toEqual(expectedMeta)
      }
    })

    test('does not change prepared segments when an encoder throws', () => {
      const root = new BaseRootRoute({})
      const route = new BaseRoute({
        getParentRoute: () => root,
        path: '/$first/{-$second}',
      })
      const history = createMemoryHistory({ initialEntries: ['/'] })
      createTestRouter({
        routeTree: root.addChildren([route]),
        history,
        isServer: server,
        scrollRestoration: false,
      })
      history.destroy()
      const prepared = route._interpolation
      expect(prepared).toBeDefined()
      expect(() =>
        interpolatePath(route.fullPath, route._interpolation!, {
          first: '\uD800',
          second: 'two',
        }),
      ).toThrow(URIError)
      expect(route._interpolation).toBe(prepared)
      expect(
        interpolatePath(route.fullPath, route._interpolation!, {
          first: 'one',
          second: 'two',
        }),
      ).toBe('/one/two')
    })
  },
)

test('never reparses a processed route for first use, Link misses or match metadata', () => {
  const root = new BaseRootRoute({})
  const route = new BaseRoute({
    getParentRoute: () => root,
    path: '/items/Pre{$id}Suffix/{-$lang}',
  })
  const history = createMemoryHistory({ initialEntries: ['/'] })
  const router = createTestRouter({
    routeTree: root.addChildren([route]),
    history,
    scrollRestoration: false,
  })
  history.destroy()
  const prepared = route._interpolation
  expect(prepared).toBeDefined()
  const parse = vi.spyOn(routeTree, 'parseSegment')
  parseInterpolationPath('/unregistered-control/$id')
  expect(parse).toHaveBeenCalled()
  parse.mockClear()
  router.buildLocation({
    to: '/items/Pre{$id}Suffix/{-$lang}',
    params: { id: 'first' },
  })
  for (let id = 0; id < 256; id++) {
    expect(
      router.buildLocation({
        to: '/items/Pre{$id}Suffix/{-$lang}',
        params: { id: String(id), lang: 'en' },
      }).href,
    ).toBe(`/items/Pre${id}Suffix/en`)
    expect(
      router.matchRoutes(`/items/Pre${id}Suffix/en`, {}).at(-1)?._strictParams,
    ).toEqual({ id: String(id), lang: 'en' })
  }
  router.pathParamsDecoder = compileDecodeCharMap(['@'])
  expect(
    router.buildLocation({
      to: '/items/Pre{$id}Suffix/{-$lang}',
      params: { id: '@last' },
    }).href,
  ).toBe('/items/Pre@lastSuffix')
  expect(route._interpolation).toBe(prepared)
  expect(parse).not.toHaveBeenCalled()
})

test.each([false, true])(
  'uses prepared segments for either trailing slash variant (server: %s)',
  (server) => {
    const root = new BaseRootRoute({})
    const route = new BaseRoute({
      getParentRoute: () => root,
      path: '/files/pre{$}.txt/',
    })
    const history = createMemoryHistory({ initialEntries: ['/'] })
    createTestRouter({
      routeTree: root.addChildren([route]),
      history,
      isServer: server,
      scrollRestoration: false,
    })
    history.destroy()
    const parse = vi.spyOn(routeTree, 'parseSegment')
    for (const path of [
      '/files/pre{$}.txt',
      '/files/pre{$}.txt/',
      '/files/pre{$}.txt',
    ]) {
      expect(
        interpolatePath(path, route._interpolation!, { _splat: 'a/b' }),
      ).toBe(path.endsWith('/') ? '/files/prea/b.txt//' : '/files/prea/b.txt')
    }
    expect(parse).not.toHaveBeenCalled()
  },
)

test.each([false, true])(
  'preserves inherited wildcard tails (server: %s)',
  (server) => {
    for (const path of ['/files/{$}.txt', '/{-$lang}/files/$', '/files/$']) {
      const root = new BaseRootRoute({})
      const parent = new BaseRoute({ getParentRoute: () => root, path })
      const child = new BaseRoute({
        getParentRoute: () => parent,
        path: '/child',
      })
      const history = createMemoryHistory({ initialEntries: ['/'] })
      createTestRouter({
        routeTree: root.addChildren([parent.addChildren([child])]),
        history,
        isServer: server,
        scrollRestoration: false,
      })
      history.destroy()
      const params = { _splat: 'a/b', lang: 'en' }
      expect(
        interpolatePath(child.fullPath, child._interpolation!, params),
      ).toBe(interpolateTestPath(child.fullPath, params))
    }
  },
)
