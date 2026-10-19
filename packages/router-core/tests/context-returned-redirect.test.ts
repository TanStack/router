import { createMemoryHistory } from '@tanstack/history'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { BaseRootRoute, BaseRoute, isRedirect, redirect } from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter, dehydrateToBootstrap } from './routerTestUtils'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('returned context redirects', () => {
  test.each(
    (['handler', 'hydrate'] as const).flatMap((step) =>
      [false, true].map((asynchronous) => ({ step, asynchronous })),
    ),
  )(
    'keeps inherited context when a terminal route context $step returns a redirect (async: $asynchronous)',
    async ({ step, asynchronous }) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const beforeLoad = vi.fn()
      const onError = vi.fn()
      const clientContext = vi.fn(() => redirect({ to: '/target' }))
      const build = (isServer: boolean) => {
        const result = () =>
          isServer ? { session: 'server' } : clientContext()
        const handler = asynchronous ? async () => result() : result
        const transform = asynchronous
          ? async () => clientContext()
          : clientContext
        const rootRoute = new BaseRootRoute({
          context: () => ({ inherited: 'root' }),
        })
        const pageRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/page',
          context:
            step === 'handler'
              ? handler
              : { handler, dehydrate: true, hydrate: transform },
          beforeLoad: isServer
            ? () => {
                throw new Error('server boundary')
              }
            : beforeLoad,
          onError: isServer ? undefined : onError,
        })
        const targetRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/target',
        })
        return createTestRouter({
          routeTree: rootRoute.addChildren([pageRoute, targetRoute]),
          history: createMemoryHistory({ initialEntries: ['/page'] }),
          isServer,
        })
      }
      const bootstrap = await dehydrateToBootstrap(build(true), { routes: {} })
      vi.stubGlobal('window', { $_TSR: bootstrap })
      const router = build(false)
      try {
        await hydrate(router)

        expect(router.state.location.pathname).toBe('/page')
        expect(router.state.matches.at(-1)?.status).toBe('error')
        expect(router.state.matches.at(-1)?.context).toEqual({
          inherited: 'root',
        })
        expect(clientContext).toHaveBeenCalledTimes(1)
        expect(beforeLoad).not.toHaveBeenCalled()
        expect(onError).not.toHaveBeenCalled()
        // The ignored redirect is reported once, attributed to its step.
        const hydrationWarnings = warn.mock.calls.filter(([message]) =>
          String(message).includes('failed during hydration'),
        )
        expect(hydrationWarnings).toHaveLength(1)
        expect(hydrationWarnings[0]![0]).toContain(
          `the \`${step === 'hydrate' ? 'context.hydrate' : 'context'}\` of route "/page" failed during hydration and is ignored`,
        )
        expect(isRedirect(hydrationWarnings[0]![1])).toBe(true)
      } finally {
        router.history.destroy()
      }
    },
  )

  test.each(
    (['function', 'object'] as const).flatMap((form) =>
      [false, true].map((asynchronous) => ({ form, asynchronous })),
    ),
  )(
    'redirects from a $form handler (async: $asynchronous) without caching the redirect',
    async ({ form, asynchronous }) => {
      let allowAccess = false
      const result = () =>
        allowAccess ? { session: 'user' } : redirect({ to: '/target' })
      const handler = vi.fn(asynchronous ? async () => result() : result)
      const beforeLoad = vi.fn(() => ({ guard: true }))
      const loader = vi.fn(() => 'page data')
      const childContext = vi.fn(() => ({ child: true }))
      const childLoader = vi.fn(() => 'child data')
      const onError = vi.fn()
      const rootRoute = new BaseRootRoute({})
      const pageRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/page',
        context: form === 'function' ? handler : { handler },
        beforeLoad,
        loader,
        onError,
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => pageRoute,
        path: '/child',
        context: childContext,
        loader: childLoader,
      })
      const targetRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/target',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([
          targetRoute,
          pageRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory({ initialEntries: ['/target'] }),
      })
      await router.load()

      await router.navigate({ to: '/page/child' })

      expect(router.state.location.pathname).toBe('/target')
      expect(router.state.matches.map((match) => match.routeId)).toEqual([
        rootRoute.id,
        targetRoute.id,
      ])
      expect(handler).toHaveBeenCalledTimes(1)
      expect(beforeLoad).not.toHaveBeenCalled()
      expect(loader).not.toHaveBeenCalled()
      expect(childContext).not.toHaveBeenCalled()
      expect(childLoader).not.toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()

      allowAccess = true
      await router.navigate({ to: '/page/child' })

      expect(router.state.location.pathname).toBe('/page/child')
      expect(handler).toHaveBeenCalledTimes(2)
      expect(beforeLoad).toHaveBeenCalledTimes(1)
      expect(loader).toHaveBeenCalledTimes(1)
      expect(childContext).toHaveBeenCalledTimes(1)
      expect(childLoader).toHaveBeenCalledTimes(1)
      expect(router.state.matches.at(-1)).toMatchObject({
        status: 'success',
        context: { session: 'user', guard: true, child: true },
        loaderData: 'child data',
      })
      expect(onError).not.toHaveBeenCalled()
    },
  )

  test.each([false, true])(
    'redirects from context revalidation (async: %s) and preserves successful previous data',
    async (asynchronous) => {
      let allowAccess = true
      const seenPrevious: Array<unknown> = []
      const beforeLoad = vi.fn()
      const loader = vi.fn(() => 'page data')
      const onError = vi.fn()
      const rootRoute = new BaseRootRoute({})
      const pageRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/page',
        context: {
          handler: () => ({ session: 'user' }),
          revalidate: ({ prev }) => {
            seenPrevious.push(prev)
            const result = allowAccess
              ? { session: 'user' }
              : redirect({ to: '/target' })
            return asynchronous ? Promise.resolve(result) : result
          },
        },
        beforeLoad,
        loader,
        onError,
      })
      const targetRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/target',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([pageRoute, targetRoute]),
        history: createMemoryHistory({ initialEntries: ['/page'] }),
      })
      await router.load()

      allowAccess = false
      await router.invalidate()

      expect(router.state.location.pathname).toBe('/target')
      expect(seenPrevious).toEqual([{ session: 'user' }])
      expect(beforeLoad).toHaveBeenCalledTimes(1)
      expect(loader).toHaveBeenCalledTimes(1)
      expect(onError).not.toHaveBeenCalled()

      allowAccess = true
      await router.navigate({ to: '/page' })

      expect(router.state.location.pathname).toBe('/page')
      expect(router.state.matches.at(-1)).toMatchObject({
        status: 'success',
        context: { session: 'user' },
        loaderData: 'page data',
      })
      expect(onError).not.toHaveBeenCalled()
    },
  )

  test.each(
    (['handler', 'hydrate'] as const).flatMap((step) =>
      [false, true].map((asynchronous) => ({ step, asynchronous })),
    ),
  )(
    'recovers from a returned redirect in context $step during hydration (async: $asynchronous)',
    async ({ step, asynchronous }) => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      let allowAccess = false
      const beforeLoad = vi.fn(() => ({ guard: true }))
      const loader = vi.fn(() => 'page data')
      const childContext = vi.fn(() => ({ child: true }))
      const childLoader = vi.fn(() => 'child data')
      const onError = vi.fn()
      const clientHandler = vi.fn(() =>
        allowAccess ? { session: 'user' } : redirect({ to: '/target' }),
      )
      const contextHydrate = vi.fn(() => redirect({ to: '/target' }))
      const build = (isServer: boolean) => {
        const result = () => (isServer ? { session: 'user' } : clientHandler())
        const handler = asynchronous ? async () => result() : result
        const transform = asynchronous
          ? async () => contextHydrate()
          : contextHydrate
        const rootRoute = new BaseRootRoute({})
        const pageRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/page',
          context:
            step === 'handler'
              ? handler
              : { handler, dehydrate: true, hydrate: transform },
          beforeLoad: isServer ? () => ({ guard: true }) : beforeLoad,
          loader: isServer ? () => 'page data' : loader,
          onError,
        })
        const childRoute = new BaseRoute({
          getParentRoute: () => pageRoute,
          path: '/child',
          context: isServer ? () => ({ child: true }) : childContext,
          loader: isServer ? () => 'child data' : childLoader,
        })
        const targetRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/target',
        })
        return createTestRouter({
          routeTree: rootRoute.addChildren([
            targetRoute,
            pageRoute.addChildren([childRoute]),
          ]),
          history: createMemoryHistory({ initialEntries: ['/page/child'] }),
          isServer,
        })
      }
      const bootstrap = await dehydrateToBootstrap(build(true), { routes: {} })
      vi.stubGlobal('window', { $_TSR: bootstrap })
      const router = build(false)

      await hydrate(router)
      await router.load()

      expect(router.state.location.pathname).toBe('/target')
      expect(router.state.matches.map((match) => match.routeId)).toEqual([
        '__root__',
        '/target',
      ])
      expect(clientHandler).toHaveBeenCalledTimes(step === 'handler' ? 2 : 1)
      expect(contextHydrate).toHaveBeenCalledTimes(step === 'hydrate' ? 1 : 0)
      expect(beforeLoad).not.toHaveBeenCalled()
      expect(loader).not.toHaveBeenCalled()
      expect(childContext).not.toHaveBeenCalled()
      expect(childLoader).not.toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()

      allowAccess = true
      await router.navigate({ to: '/page/child' })

      expect(router.state.location.pathname).toBe('/page/child')
      expect(clientHandler).toHaveBeenCalledTimes(step === 'handler' ? 3 : 2)
      expect(contextHydrate).toHaveBeenCalledTimes(step === 'hydrate' ? 1 : 0)
      expect(router.state.matches.at(-1)).toMatchObject({
        status: 'success',
        context: { session: 'user', guard: true, child: true },
        loaderData: 'child data',
      })
      expect(onError).not.toHaveBeenCalled()
    },
  )
})
