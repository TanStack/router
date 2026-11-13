import { createMemoryHistory } from '@tanstack/history'
import { describe, expect, it } from 'vitest'
import { BaseRootRoute, BaseRoute, getRouteSegments } from '../src'
import { createTestRouter } from './routerTestUtils'
import type { AnyRoute } from '../src'

describe('matching previously unexplored route prefixes', () => {
  it.each([false, true])(
    'preserves competing routes with reverse visits: %s',
    (reverse) => {
      const root = new BaseRootRoute({})
      const route = (path: string) =>
        new BaseRoute({ getParentRoute: () => root, path })
      const fallback = route('/$slug/details')
      const settings = route('/settings/details')
      const optional = route('/docs/{-$lang}/guide')
      const wildcard = route('/files/prefix{$}.txt')
      const index = route('/settings/')
      const router = createTestRouter({
        routeTree: root.addChildren([
          fallback,
          settings,
          optional,
          wildcard,
          index,
        ]),
        history: createMemoryHistory(),
      })
      const cases: Array<[string, AnyRoute, Record<string, string>]> = [
        ['/other/details', fallback, { slug: 'other' }],
        ['/settings/details', settings, {}],
        ['/docs/guide', optional, {}],
        ['/docs/fr/guide', optional, { lang: 'fr' }],
        [
          '/files/prefixone/two.txt',
          wildcard,
          { _splat: 'one/two', '*': 'one/two' },
        ],
        ['/settings', index, {}],
      ]
      if (reverse) {
        cases.reverse()
      }
      for (const [path, expected, params] of [...cases, ...cases]) {
        const [branch, rawParams, found] = router.getMatchedRoutes(path)
        expect(found).toBe(expected)
        expect(branch).toEqual([root, expected])
        expect(rawParams).toEqual(params)
      }
      router.history.destroy()
    },
  )

  it.each([false, true])(
    'preserves pathless and flat alias declaration order: %s',
    (flatFirst) => {
      const root = new BaseRootRoute({})
      const first = new BaseRoute({ getParentRoute: () => root, id: '_first' })
      const second = new BaseRoute({
        getParentRoute: () => first,
        id: '_second',
      })
      const nested = new BaseRoute({
        getParentRoute: () => second,
        path: '/shared/$nested/details',
      })
      first.addChildren([second.addChildren([nested])])
      const flat = new BaseRoute({
        getParentRoute: () => root,
        path: '/shared/$flat/details',
      })
      const router = createTestRouter({
        routeTree: root.addChildren(flatFirst ? [flat, first] : [first, flat]),
        history: createMemoryHistory(),
      })
      for (const value of ['cold', 'warm']) {
        const [branch, params, found] = router.getMatchedRoutes(
          `/shared/${value}/details`,
        )
        expect(found).toBe(flatFirst ? flat : nested)
        expect(branch).toEqual(
          flatFirst ? [root, flat] : [root, first, second, nested],
        )
        expect(params).toEqual(flatFirst ? { flat: value } : { nested: value })
      }
      router.history.destroy()
    },
  )

  it('keeps case defaults and overrides across deferred segments', () => {
    const root = new BaseRootRoute({})
    const sensitive = new BaseRoute({
      getParentRoute: () => root,
      path: '/Strict/Deep/pre{$id}Suf',
    })
    const insensitive = new BaseRoute({
      getParentRoute: () => root,
      path: '/Loose/Deep/pre{$id}Suf',
      caseSensitive: false,
    })
    const router = createTestRouter({
      routeTree: root.addChildren([sensitive, insensitive]),
      caseSensitive: true,
      history: createMemoryHistory(),
    })
    expect(router.getMatchedRoutes('/Strict/deep/preoneSuf')[2]).toBeUndefined()
    expect(router.getMatchedRoutes('/Strict/Deep/PREoneSuf')[2]).toBeUndefined()
    for (const value of ['one', 'two']) {
      expect(router.getMatchedRoutes(`/Strict/Deep/pre${value}Suf`)[2]).toBe(
        sensitive,
      )
      expect(router.getMatchedRoutes(`/loose/deep/PRE${value}SUF`)[2]).toBe(
        insensitive,
      )
    }
    router.history.destroy()
  })

  it('builds links and exposes interpolation before visiting a route', () => {
    const root = new BaseRootRoute({})
    const projects = new BaseRoute({
      getParentRoute: () => root,
      path: '/projects/$project',
    })
    const settings = new BaseRoute({
      getParentRoute: () => projects,
      path: '/settings/$tab',
    })
    const router = createTestRouter({
      routeTree: root.addChildren([projects.addChildren([settings])]),
      history: createMemoryHistory(),
    })
    expect(
      router.buildLocation({
        to: '/projects/$project/settings/$tab',
        params: { project: 'one', tab: 'permissions' },
      }).pathname,
    ).toBe('/projects/one/settings/permissions')
    expect(getRouteSegments(settings)).toBeDefined()
    expect(
      router.getMatchedRoutes('/projects/two/settings/members')[0],
    ).toEqual([root, projects, settings])
    router.history.destroy()
  })

  it.each([false, true])(
    'keeps declaration order and names across nested and flat aliases: %s',
    (flatFirst) => {
      const root = new BaseRootRoute({})
      const parent = new BaseRoute({ getParentRoute: () => root, path: '/a' })
      const nested = new BaseRoute({
        getParentRoute: () => parent,
        path: '/$nested/details',
      })
      const flat = new BaseRoute({
        getParentRoute: () => root,
        path: '/a/$flat/details',
      })
      parent.addChildren([nested])
      const router = createTestRouter({
        routeTree: root.addChildren(
          flatFirst ? [flat, parent] : [parent, flat],
        ),
        history: createMemoryHistory(),
      })
      router.getMatchedRoutes('/a/other')
      for (const value of ['first', 'second']) {
        const [branch, params, found] = router.getMatchedRoutes(
          `/a/${value}/details`,
        )
        expect(found).toBe(flatFirst ? flat : nested)
        expect(branch).toEqual(
          flatFirst ? [root, flat] : [root, parent, nested],
        )
        expect(params).toEqual(flatFirst ? { flat: value } : { nested: value })
      }
      router.history.destroy()
    },
  )

  it('settles parser priorities and pathless gates before selecting a branch', () => {
    const root = new BaseRootRoute({})
    const fallback = new BaseRoute({
      getParentRoute: () => root,
      path: '/items/$fallback',
    })
    const preferred = new BaseRoute({
      getParentRoute: () => root,
      path: '/items/{$preferred}',
      params: {
        priority: 10,
        parse: (params) => (params.preferred === 'special' ? params : false),
      },
    })
    const parent = new BaseRoute({
      getParentRoute: () => root,
      path: '/teams/$team',
    })
    const layout = new BaseRoute({
      getParentRoute: () => parent,
      id: '_layout',
      params: {
        parse: (params: Record<string, string>) =>
          params.team === 'allowed' ? params : false,
      },
    })
    const leaf = new BaseRoute({
      getParentRoute: () => layout,
      path: '/details',
    })
    const router = createTestRouter({
      routeTree: root.addChildren([
        fallback,
        preferred,
        parent.addChildren([layout.addChildren([leaf])]),
      ]),
      history: createMemoryHistory(),
    })
    expect(router.getMatchedRoutes('/items/ordinary')[2]).toBe(fallback)
    expect(router.getMatchedRoutes('/teams/allowed/details')[0]).toEqual([
      root,
      parent,
      layout,
      leaf,
    ])
    expect(router.getMatchedRoutes('/items/special')[2]).toBe(preferred)
    expect(router.getMatchedRoutes('/teams/denied/details')[2]).toBe(parent)
    expect(router.getMatchedRoutes('/items/ordinary')[2]).toBe(fallback)
    router.history.destroy()
  })

  it('keeps cached misses and fuzzy matches valid as other prefixes are explored', () => {
    const root = new BaseRootRoute({})
    const a = new BaseRoute({ getParentRoute: () => root, path: '/a' })
    const b = new BaseRoute({ getParentRoute: () => root, path: '/b/deep/$id' })
    const router = createTestRouter({
      routeTree: root.addChildren([a, b]),
      history: createMemoryHistory(),
    })
    expect(router.getMatchedRoutes('/missing')[2]).toBeUndefined()
    expect(router.getMatchedRoutes('/a/missing')[1]).toEqual({
      '**': 'missing',
    })
    expect(router.getMatchedRoutes('/b/deep/one')[2]).toBe(b)
    expect(router.getMatchedRoutes('/missing')[2]).toBeUndefined()
    expect(router.getMatchedRoutes('/a/missing')[1]).toEqual({
      '**': 'missing',
    })
    router.history.destroy()
  })

  it.each([false, true])(
    'matches rebuilt routes after expanding the old prefix: %s',
    (expanded) => {
      const root = new BaseRootRoute({})
      const left = new BaseRoute({ getParentRoute: () => root, path: '/left' })
      const right = new BaseRoute({
        getParentRoute: () => root,
        path: '/right',
      })
      let parent: AnyRoute = left
      const child = new BaseRoute({
        getParentRoute: () => parent,
        path: '/child/$id',
      })
      const router = createTestRouter({
        routeTree: root.addChildren([left.addChildren([child]), right]),
        history: createMemoryHistory(),
      })
      if (expanded) {
        expect(router.getMatchedRoutes('/left/child/old')[0]).toEqual([
          root,
          left,
          child,
        ])
      }
      parent = right
      left.addChildren([])
      right.addChildren([child])
      router.setRoutes(router.buildRouteTree())
      const [branch, params, found] =
        router.getMatchedRoutes('/right/child/new')
      expect(branch).toEqual([root, right, child])
      expect(params).toEqual({ id: 'new' })
      expect(found).toBe(child)
      expect(router.getMatchedRoutes('/left/child/old')[2]).toBe(left)
      expect(
        router.buildLocation({
          to: '/right/child/$id',
          params: { id: 'linked' },
        }).pathname,
      ).toBe('/right/child/linked')
      router.history.destroy()
    },
  )
})
