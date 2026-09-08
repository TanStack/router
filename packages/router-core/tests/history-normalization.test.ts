import { createHashHistory, createMemoryHistory } from '@tanstack/history'
import { describe, expect, test } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

const fragments = ['/\\section', '\\/section', '\\\\section']

describe('history normalization boundaries', () => {
  test('preserves distinct logical and masked fragment data through a rewrite', async () => {
    const router = createTestRouter({
      routeTree: new BaseRootRoute(),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: false,
      rewrite: { input: ({ url }) => url },
    })
    await router.load()
    await router.navigate({
      to: '/',
      hash: '/\\logical',
      mask: { to: '/', hash: '\\/public' },
    })
    expect(router.state.location.hash).toBe('/\\logical')
    expect(router.state.location.maskedLocation?.hash).toBe('\\/public')
    expect(router.history.location.hash).toBe('#\\/public')
  })

  test.each([
    { rewrite: false, isServer: false },
    { rewrite: true, isServer: false },
    { rewrite: false, isServer: true },
    { rewrite: true, isServer: true },
  ])(
    'normalizes a generated splat destination before output rewriting (%s)',
    ({ rewrite, isServer }) => {
      const root = new BaseRootRoute()
      const splat = new BaseRoute({ getParentRoute: () => root, path: '$' })
      const rewrittenOrigins: Array<string> = []
      const router = createTestRouter({
        routeTree: root.addChildren([splat]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
        origin: 'https://app.example',
        isServer,
        rewrite: rewrite
          ? {
              output: ({ url }) => {
                rewrittenOrigins.push(url.origin)
                return url
              },
            }
          : undefined,
      })
      const location = router.buildLocation({
        to: '/$',
        params: { _splat: '/other.example/path' },
      })
      expect(location.pathname).toBe('/other.example/path')
      expect(location.publicHref).toBe('/other.example/path')
      expect(rewrittenOrigins).toEqual(rewrite ? ['https://app.example'] : [])
    },
  )

  test.each(fragments)('preserves fragment data %j on initial load', (hash) => {
    const router = createTestRouter({
      routeTree: new BaseRootRoute(),
      history: createMemoryHistory({ initialEntries: [`/#${hash}`] }),
    })

    expect(router.state.location.hash).toBe(hash)
    expect(router.state.location.href).toBe(`/#${hash}`)
  })

  test.each(fragments)(
    'preserves fragment data %j through navigation',
    async (hash) => {
      const router = createTestRouter({
        routeTree: new BaseRootRoute(),
        history: createMemoryHistory({ initialEntries: ['/'] }),
        isServer: false,
      })
      await router.load()
      await router.navigate({ to: '/', hash })

      expect(router.state.location.hash).toBe(hash)
      expect(router.history.location.hash).toBe(`#${hash}`)
    },
  )

  test.each(fragments)(
    'preserves fragment data %j after an input rewrite',
    (hash) => {
      const router = createTestRouter({
        routeTree: new BaseRootRoute(),
        history: createMemoryHistory({ initialEntries: ['/public'] }),
        rewrite: {
          input: ({ url }) => {
            url.pathname = '/'
            url.hash = hash
            return url
          },
        },
      })

      expect(router.state.location.hash).toBe(hash)
    },
  )

  test.each(fragments)(
    'preserves nested fragment data %j with hash history',
    async (hash) => {
      window.history.replaceState(null, '', `/shell#/route#${hash}`)
      const history = createHashHistory()
      try {
        const root = new BaseRootRoute()
        const router = createTestRouter({
          routeTree: root.addChildren([
            new BaseRoute({ getParentRoute: () => root, path: '/route' }),
          ]),
          history,
          isServer: false,
        })
        expect(router.state.location.pathname).toBe('/route')
        expect(router.state.location.hash).toBe(hash)
        await router.load()
        await router.navigate({ to: '/route', hash: `${hash}-next` })
        history.flush()
        expect(router.state.location.hash).toBe(`${hash}-next`)
        expect(window.location.hash).toBe(`#/route#${hash}-next`)
      } finally {
        history.destroy()
        window.history.replaceState(null, '', '/')
      }
    },
  )
})
