import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  notFound,
  redirect,
} from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter, dehydrateToBootstrap } from './routerTestUtils'
import type { TsrSsrGlobal } from '../src/ssr/types'

const manifest = { routes: {} }

describe('public hydration interruption', () => {
  let mockWindow: { $_TSR?: TsrSsrGlobal }

  beforeEach(() => {
    mockWindow = {}
    vi.stubGlobal('window', mockWindow)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test.each([
    'context',
    'context.hydrate',
    'beforeLoad',
    'beforeLoad.hydrate',
  ] as const)('supersedes an abort-ignoring %s', async (lifecycle) => {
    const entered = createControlledPromise<void>()
    const release = createControlledPromise<void>()
    const onError = vi.fn()
    const build = (isServer: boolean) => {
      const rootRoute = new BaseRootRoute({})
      const wait = async () => {
        if (!isServer) {
          entered.resolve()
          await release
        }
        return { ready: true }
      }
      const option = lifecycle.endsWith('.hydrate')
        ? {
            handler: () => ({ ready: true }),
            dehydrate: true,
            hydrate: wait,
          }
        : { handler: wait, dehydrate: false }
      const pageRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/page',
        [lifecycle.split('.')[0]!]: option,
        onError,
      })
      const otherRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/other',
      })
      return createTestRouter({
        routeTree: rootRoute.addChildren([pageRoute, otherRoute]),
        history: createMemoryHistory({ initialEntries: ['/page'] }),
        isServer,
      })
    }
    mockWindow.$_TSR = await dehydrateToBootstrap(build(true), manifest)
    const router = build(false)
    let finished = false
    const hydration = hydrate(router).then(() => {
      finished = true
    })
    try {
      await entered
      await router.navigate({ to: '/other' })
      await expect.poll(() => finished, { timeout: 500 }).toBe(true)
      expect(router.state.location.pathname).toBe('/other')
      expect(router.state.matches.at(-1)?.status).toBe('success')
      expect(onError).not.toHaveBeenCalled()
    } finally {
      release.resolve()
      await hydration
      router.history.destroy()
    }
  })

  test('recovers a failed loader transform after its ancestors settle', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const rootRelease = createControlledPromise<void>()
    const childRelease = createControlledPromise<void>()
    const started: Array<string> = []
    const build = (isServer: boolean) => {
      const loader = (name: string) => ({
        handler: () => ({ name }),
        dehydrate: true as const,
        hydrate: async ({ data }: { data: { name: string } }) => {
          started.push(name)
          if (name === 'root') {
            await rootRelease
          } else if (name === 'parent') {
            throw new Error('parent transform failed')
          } else {
            await childRelease
          }
          return data
        },
      })
      const rootRoute = new BaseRootRoute({ loader: loader('root') })
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        loader: loader('parent'),
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: loader('child'),
      })
      return createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
        isServer,
      })
    }
    mockWindow.$_TSR = await dehydrateToBootstrap(build(true), manifest)
    const router = build(false)
    let finished = false
    const hydration = hydrate(router).then(() => {
      finished = true
    })
    try {
      await expect.poll(() => started).toEqual(['root', 'parent', 'child'])
      expect(finished).toBe(false)
      rootRelease.resolve()
      await expect.poll(() => finished, { timeout: 500 }).toBe(true)
      expect(router.state.matches[0]?.loaderData).toEqual({ name: 'root' })
      await router.load()
      expect(router.state.matches.map((match) => match.loaderData)).toEqual([
        { name: 'root' },
        { name: 'parent' },
        { name: 'child' },
      ])
    } finally {
      rootRelease.resolve()
      childRelease.resolve()
      await hydration
      router.history.destroy()
    }
  })

  test('does not start head or scripts after a serial hydration callback aborts', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const head = vi.fn(() => ({ meta: [{ title: 'Client page' }] }))
    const scripts = vi.fn(() => [{ children: 'window.pageReady = true' }])
    let aborted = false
    const build = (isServer: boolean) => {
      const rootRoute = new BaseRootRoute({
        context: ({ abortController }) => {
          if (!isServer && !aborted) {
            aborted = true
            abortController.abort()
          }
          return { ready: true }
        },
        head: isServer ? undefined : head,
        scripts: isServer ? undefined : scripts,
      })
      const pageRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/page',
      })
      return createTestRouter({
        routeTree: rootRoute.addChildren([pageRoute]),
        history: createMemoryHistory({ initialEntries: ['/page'] }),
        isServer,
      })
    }
    mockWindow.$_TSR = await dehydrateToBootstrap(build(true), manifest)
    const router = build(false)
    try {
      await hydrate(router)
      expect(aborted).toBe(true)
      expect(head).not.toHaveBeenCalled()
      expect(scripts).not.toHaveBeenCalled()

      await router.load()
      expect(head).toHaveBeenCalledTimes(1)
      expect(scripts).toHaveBeenCalledTimes(1)
      expect(router.state.matches.at(-1)?.status).toBe('success')
      expect(router.state.resolvedLocation?.pathname).toBe('/page')
    } finally {
      router.history.destroy()
    }
  })

  test.each([false, true])(
    'finishes hydration when its owner aborts during a loader transform (terminal: %s)',
    async (terminal) => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      let controller: AbortController | undefined
      const clientLoader = vi.fn(() => 'client parent')
      const build = (isServer: boolean) => {
        const rootRoute = new BaseRootRoute({
          context: ({ abortController }) => {
            if (!isServer) {
              controller = abortController
            }
            return { root: true }
          },
        })
        const parentRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/parent',
          notFoundComponent: () => 'parent not found',
          loader: {
            handler: isServer ? () => 'server parent' : clientLoader,
            dehydrate: true,
            hydrate: () => {
              controller!.abort('application cancellation')
              return new Promise<string>(() => {})
            },
          },
        })
        const childRoute = new BaseRoute({
          getParentRoute: () => parentRoute,
          path: '/child',
          loader: () => {
            if (terminal) {
              throw notFound()
            }
            return 'child data'
          },
        })
        return createTestRouter({
          routeTree: rootRoute.addChildren([
            parentRoute.addChildren([childRoute]),
          ]),
          history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
          isServer,
        })
      }
      mockWindow.$_TSR = await dehydrateToBootstrap(build(true), manifest)
      const router = build(false)
      try {
        await hydrate(router)
        expect(controller?.signal.aborted).toBe(true)
        expect(clientLoader).not.toHaveBeenCalled()
        expect(router.state.matches[1]?.status).toBe(
          terminal ? 'notFound' : 'pending',
        )
        expect(router.state.matches[1]?.isFetching).toBe(false)
        if (terminal) {
          expect(router.state.resolvedLocation?.pathname).toBe('/parent/child')
        } else {
          await router.load()
          expect(clientLoader).toHaveBeenCalledTimes(1)
          expect(router.state.matches[1]?.loaderData).toBe('client parent')
          expect(router.state.resolvedLocation?.pathname).toBe('/parent/child')
        }
      } finally {
        router.clearCache()
        router.history.destroy()
      }
    },
  )

  test.each(['success', 'redirect'] as const)(
    'ignores a detached descendant’s late %s after fallback completes',
    async (lateOutcome) => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const childStarted = createControlledPromise<void>()
      const childRelease = createControlledPromise<void>()
      const childFinished = createControlledPromise<void>()
      const validateTargetSearch = vi.fn(
        (search: Record<string, unknown>) => search,
      )
      const onError = vi.fn()
      const childSignals: Array<AbortSignal> = []
      let childCalls = 0
      const build = (isServer: boolean) => {
        const rootRoute = new BaseRootRoute({})
        const parentRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/parent',
          loader: {
            handler: () => 'parent data',
            dehydrate: true,
            hydrate: () => {
              throw new Error('parent transform failed')
            },
          },
        })
        const childRoute = new BaseRoute({
          getParentRoute: () => parentRoute,
          path: '/child',
          onError,
          loader: {
            handler: async ({ abortController }) => {
              if (isServer) {
                return 'server child'
              }
              childSignals.push(abortController.signal)
              childCalls++
              if (childCalls === 1) {
                childStarted.resolve()
                // This application operation deliberately has no abort listener.
                await childRelease
                childFinished.resolve()
                return lateOutcome === 'redirect'
                  ? redirect({
                      to: '/redirect-target',
                      search: { late: true },
                    })
                  : 'obsolete child data'
              }
              return 'current child data'
            },
            dehydrate: false,
          },
        })
        const targetRoute = new BaseRoute({
          getParentRoute: () => rootRoute,
          path: '/redirect-target',
          validateSearch: validateTargetSearch,
        })
        return createTestRouter({
          routeTree: rootRoute.addChildren([
            parentRoute.addChildren([childRoute]),
            targetRoute,
          ]),
          history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
          isServer,
        })
      }
      mockWindow.$_TSR = await dehydrateToBootstrap(build(true), manifest)
      const router = build(false)
      let finished = false
      const hydration = hydrate(router).then(() => {
        finished = true
      })
      try {
        await childStarted
        await expect.poll(() => finished, { timeout: 500 }).toBe(true)
        expect(childSignals[0]?.aborted).toBe(true)

        await router.load()
        expect(childCalls).toBe(2)
        expect(router.state.matches.at(-1)).toMatchObject({
          status: 'success',
          loaderData: 'current child data',
        })
        expect(childSignals[1]?.aborted).toBe(false)
        expect(validateTargetSearch).not.toHaveBeenCalled()
        const accepted = router.state.matches.map((match) => ({
          id: match.id,
          status: match.status,
          loaderData: match.loaderData,
          context: match.context,
        }))

        childRelease.resolve()
        await childFinished
        // Let the detached operation's outcome and redirect continuations run.
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(
          router.state.matches.map((match) => ({
            id: match.id,
            status: match.status,
            loaderData: match.loaderData,
            context: match.context,
          })),
        ).toEqual(accepted)
        expect(router.state.location.pathname).toBe('/parent/child')
        expect(router.state.resolvedLocation?.pathname).toBe('/parent/child')
        expect(childCalls).toBe(2)
        expect(childSignals[1]?.aborted).toBe(false)
        expect(validateTargetSearch).not.toHaveBeenCalled()
        expect(onError).not.toHaveBeenCalled()
      } finally {
        childRelease.resolve()
        await hydration
        router.clearCache()
        router.history.destroy()
      }
    },
  )

  test('keeps replacement loader fetching state when detached hydration work settles', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const obsoleteStarted = createControlledPromise<void>()
    const obsoleteRelease = createControlledPromise<void>()
    const replacementStarted = createControlledPromise<void>()
    const replacementRelease = createControlledPromise<void>()
    let calls = 0
    const build = (isServer: boolean) => {
      const rootRoute = new BaseRootRoute({})
      const parentRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/parent',
        loader: {
          handler: () => 'parent data',
          dehydrate: true,
          hydrate: () => {
            throw new Error('parent transform failed')
          },
        },
      })
      const childRoute = new BaseRoute({
        getParentRoute: () => parentRoute,
        path: '/child',
        loader: {
          handler: async () => {
            if (isServer) {
              return 'server child'
            }
            if (++calls === 1) {
              obsoleteStarted.resolve()
              await obsoleteRelease
              return 'obsolete child'
            }
            replacementStarted.resolve()
            await replacementRelease
            return 'replacement child'
          },
          dehydrate: false,
        },
      })
      return createTestRouter({
        routeTree: rootRoute.addChildren([
          parentRoute.addChildren([childRoute]),
        ]),
        history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
        defaultPendingMs: 0,
        defaultPendingMinMs: 0,
        isServer,
      })
    }
    mockWindow.$_TSR = await dehydrateToBootstrap(build(true), manifest)
    const router = build(false)
    let loading: ReturnType<typeof router.load> | undefined
    try {
      await hydrate(router)
      await obsoleteStarted
      loading = router.load()
      await replacementStarted
      await expect
        .poll(() => router.state.matches.at(-1)?.isFetching)
        .toBe('loader')

      obsoleteRelease.resolve()
      // Let the old operation's outcome and cleanup callbacks finish while
      // replacement work is still blocked on its own application promise.
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(router.state.matches.at(-1)?.isFetching).toBe('loader')

      replacementRelease.resolve()
      await loading
      expect(router.state.matches.at(-1)).toMatchObject({
        status: 'success',
        isFetching: false,
        loaderData: 'replacement child',
      })
      expect(calls).toBe(2)
    } finally {
      obsoleteRelease.resolve()
      replacementRelease.resolve()
      await loading
      router.clearCache()
      router.history.destroy()
    }
  })
})
