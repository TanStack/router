import { createMemoryHistory } from '@tanstack/history'
import { isServer as serverEnvironment } from '@tanstack/router-core/isServer'
import { describe, expect, test } from 'vitest'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createTestRouter } from './routerTestUtils'
import type { ToOptions } from '../src'

function setup(configuredMask: boolean, isServer = false) {
  const root = new BaseRootRoute({})
  const item = new BaseRoute({
    getParentRoute: () => root,
    path: '/items/$id',
    loader: () => 'internal item',
  })
  const publicItem = new BaseRoute({
    getParentRoute: () => root,
    path: '/en/items/$id',
    loader: () => 'public item',
  })
  const routeTree = root.addChildren([item, publicItem])
  const history = createMemoryHistory({
    initialEntries: ['/items/start?q=start'],
  })
  const router = createTestRouter({
    routeTree,
    history,
    isServer,
    scrollRestoration: false,
    routeMasks: configuredMask
      ? [
          {
            routeTree,
            from: '/items/$id',
            to: '/en/items/$id',
            params: true,
            inheritSearch: true,
          },
        ]
      : undefined,
  })
  const mask = (id: string) =>
    configuredMask
      ? {}
      : {
          mask: {
            to: '/en/items/$id',
            params: { id },
            inheritSearch: true as const,
          },
        }
  return { router, history, item, mask }
}

describe.each([false, true])(
  'inherited mask navigation (configured=%s)',
  (configuredMask) => {
    test('restores internal matches and visible search across repeated navigation and history traversal', async () => {
      const { router, history, item, mask } = setup(configuredMask)
      const assertLocation = (id: string, q: string) => {
        const href = `/items/${id}?q=${q}`
        const publicHref = `/en/items/${id}?q=${q}`
        expect(history.location.href).toBe(publicHref)
        expect(router.state.location.href).toBe(href)
        expect(router.state.location.search).toEqual({ q })
        expect(router.state.location.maskedLocation?.href).toBe(publicHref)
        expect(router.state.matches.at(-1)).toMatchObject({
          routeId: item.id,
          params: { id },
          status: 'success',
          loaderData: 'internal item',
        })
      }
      const traverse = async (direction: 'back' | 'forward') => {
        const finished = createControlledPromise<void>()
        // Core has no mounted framework adapter to load history changes.
        const unsubscribe = history.subscribe(({ action }) => {
          void router.load({ action }).then(
            () => finished.resolve(),
            (error) => finished.reject(error),
          )
        })
        try {
          history[direction]()
          await finished
        } finally {
          unsubscribe()
        }
      }
      try {
        await router.load()
        await router.navigate({
          to: '/items/$id',
          params: { id: 'one' },
          search: { q: 'first' },
          ...mask('one'),
        })
        assertLocation('one', 'first')
        await router.navigate({
          to: '/items/$id',
          params: { id: 'two' },
          search: { q: 'second' },
          ...mask('two'),
        })
        assertLocation('two', 'second')
        await traverse('back')
        assertLocation('one', 'first')
        await traverse('forward')
        assertLocation('two', 'second')
        await router.navigate({
          to: '/items/$id',
          params: { id: 'two' },
          search: { q: 'third' },
          ...mask('two'),
        })
        assertLocation('two', 'third')
        await traverse('back')
        assertLocation('two', 'second')
      } finally {
        history.destroy()
      }
    })

    describe.each([false, true])(
      'stable destination (server=%s)',
      (isServer) => {
        function createBuild() {
          expect(serverEnvironment).toBeUndefined()
          const fixture = setup(configuredMask, isServer)
          const sources = ['one', 'two'].map((q) =>
            fixture.router.buildLocation({
              to: '/items/$id',
              params: { id: q },
              search: { q },
            }),
          )
          const options: ToOptions = {
            to: '/items/$id',
            params: { id: 'destination' },
            ...fixture.mask('destination'),
          }
          const build = () =>
            sources.map((source) => {
              // Match the stable options/source pattern used by Links, without
              // mounting or claiming coverage of a framework Link binding.
              options._fromLocation = source
              return fixture.router.buildLocation(options)
            })
          return { ...fixture, options, build }
        }

        test('reuses a fixed inherited mask on the client and rebuilds it on the server', () => {
          const { history, options, build } = createBuild()
          try {
            options.search = { q: 'fixed' }
            const [first, second] = build()
            expect(second === first).toBe(!isServer)
            for (const location of [first!, second!]) {
              expect(location.href).toBe('/items/destination?q=fixed')
              expect(location.maskedLocation?.href).toBe(
                '/en/items/destination?q=fixed',
              )
              expect(location.maskedLocation?.search).toBe(location.search)
            }
          } finally {
            history.destroy()
          }
        })

        test.each(['preserve', 'updater'] as const)(
          'rebuilds inherited search from each source for a main %s search',
          (mode) => {
            const { history, options, build } = createBuild()
            try {
              options.search =
                mode === 'preserve'
                  ? true
                  : (previous: unknown) => {
                      if (
                        typeof previous !== 'object' ||
                        previous === null ||
                        !('q' in previous)
                      ) {
                        throw new Error('Expected the source search')
                      }
                      return { q: `${previous.q}-updated` }
                    }
              const [first, second] = build()
              expect(second).not.toBe(first)
              const queries =
                mode === 'preserve'
                  ? ['one', 'two']
                  : ['one-updated', 'two-updated']
              for (const [index, location] of [first!, second!].entries()) {
                expect(location.href).toBe(
                  `/items/destination?q=${queries[index]}`,
                )
                expect(location.maskedLocation?.href).toBe(
                  `/en/items/destination?q=${queries[index]}`,
                )
                expect(location.maskedLocation?.search).toBe(location.search)
                expect(location.maskedLocation?.searchStr).toBe(
                  location.searchStr,
                )
              }
            } finally {
              history.destroy()
            }
          },
        )
      },
    )
  },
)
