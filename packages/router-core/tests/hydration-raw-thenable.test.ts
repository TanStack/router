import { afterEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  createSerializationAdapter,
} from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter, dehydrateToBootstrap } from './routerTestUtils'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe.each(['context', 'beforeLoad'] as const)(
  'raw transported %s',
  (lifecycle) => {
    test.each(['fulfillment', 'rejection'] as const)(
      'finishes superseded hydration before a late %s',
      async (settlement) => {
        const entered = createControlledPromise<void>()
        const gate = createControlledPromise<{ label: string }>()

        // The server instance has no callable then. The adapter restores the
        // same public type with pending client work, without a route hydrate.
        class AdaptedContext {
          constructor(
            readonly label: string,
            readonly then?: PromiseLike<{ label: string }>['then'],
          ) {}
        }

        const fromSerializable = vi.fn(
          (label: string) =>
            new AdaptedContext(label, (onfulfilled, onrejected) => {
              entered.resolve()
              return gate.then(onfulfilled, onrejected)
            }),
        )
        const adapter = createSerializationAdapter({
          key: 'pending-raw-context',
          test: (value: unknown): value is AdaptedContext =>
            value instanceof AdaptedContext,
          toSerializable: (value: AdaptedContext) => value.label,
          fromSerializable,
        })
        const handler = vi.fn(() => new AdaptedContext('server'))
        const onError = vi.fn()
        const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const build = (isServer: boolean) => {
          const root = new BaseRootRoute({})
          const page = new BaseRoute({
            getParentRoute: () => root,
            path: '/page',
            context:
              lifecycle === 'context'
                ? { handler, dehydrate: true }
                : undefined,
            beforeLoad:
              lifecycle === 'beforeLoad'
                ? { handler, dehydrate: true }
                : undefined,
            onError,
          })
          const other = new BaseRoute({
            getParentRoute: () => root,
            path: '/other',
            beforeLoad: () => ({ active: 'other' }),
          })
          const router = createTestRouter({
            routeTree: root.addChildren([page, other]),
            history: createMemoryHistory({ initialEntries: ['/page'] }),
            isServer,
            scrollRestoration: false,
          })
          router.options.serializationAdapters = [adapter]
          return router
        }

        const server = build(true)
        vi.stubGlobal('window', {
          $_TSR: await dehydrateToBootstrap(server, { routes: {} }),
        })
        const router = build(false)
        let finished = false
        const hydration = hydrate(router).then(() => {
          finished = true
        })
        try {
          await entered
          expect(handler).toHaveBeenCalledTimes(1)
          expect(fromSerializable).toHaveBeenCalledExactlyOnceWith('server')

          await router.navigate({ to: '/other' })
          await expect.poll(() => finished, { timeout: 500 }).toBe(true)
          expect(router.state.matches.at(-1)).toMatchObject({
            status: 'success',
            context: { active: 'other' },
          })

          if (settlement === 'fulfillment') {
            gate.resolve({ label: 'obsolete' })
          } else {
            gate.reject(new Error('obsolete adapter work'))
          }
          await hydration
          await new Promise((resolve) => setTimeout(resolve))

          expect(router.state.location.pathname).toBe('/other')
          expect(router.state.matches.at(-1)?.context).toEqual({
            active: 'other',
          })
          expect(handler).toHaveBeenCalledTimes(1)
          expect(onError).not.toHaveBeenCalled()
          expect(warning).not.toHaveBeenCalled()
        } finally {
          gate.resolve({ label: 'cleanup' })
          await hydration
          router.clearCache()
          router.history.destroy()
          server.clearCache()
          server.history.destroy()
        }
      },
    )
  },
)
