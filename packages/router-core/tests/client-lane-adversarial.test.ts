import { afterEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  notFound,
  redirect,
} from '../src'
import { createTestRouter } from './routerTestUtils'

const testCleanups: Array<() => void | Promise<void>> = []

afterEach(async () => {
  while (testCleanups.length) {
    await testCleanups.pop()!()
  }
  vi.useRealTimers()
})

function abortAwareGate(signal: AbortSignal): Promise<void> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener(
      'abort',
      () => {
        const error = new Error('aborted')
        error.name = 'AbortError'
        reject(error)
      },
      { once: true },
    )
  })
}

describe('adversarial client lane ownership', () => {
  test.each(['onBeforeNavigate', 'onBeforeLoad'] as const)(
    'a throwing %s listener cannot interrupt later listeners or navigation finalization',
    async (eventType) => {
      const listenerError = new Error(`${eventType} listener failed`)
      const laterListener = vi.fn()
      const unhandledRejection = vi.fn()
      process.on('unhandledRejection', unhandledRejection)
      testCleanups.push(() => {
        process.off('unhandledRejection', unhandledRejection)
      })

      const rootRoute = new BaseRootRoute({})
      const indexRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
      })
      const targetRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/target',
        loader: () => 'target data',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([indexRoute, targetRoute]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
      })

      await router.load()
      router.subscribe(eventType, () => {
        throw listenerError
      })
      router.subscribe(eventType, laterListener)

      await router.navigate({ to: '/target' })
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(laterListener).toHaveBeenCalledTimes(1)
      expect(router.state.location.pathname).toBe('/target')
      expect(router.state.matches.at(-1)).toMatchObject({
        routeId: targetRoute.id,
        status: 'success',
      })
      expect(router.stores.isLoading.get()).toBe(false)
      expect(unhandledRejection).toHaveBeenCalledWith(
        listenerError,
        expect.anything(),
      )
    },
  )

  test.each([
    ['normal client commit', false],
    ['prepopulated hydration lane', true],
  ] as const)(
    'superseding a published pending lane diffs lifecycle hooks from the last final lane (%s)',
    async (_name, prepopulateActiveLane) => {
      const aOnLeave = vi.fn()
      const bOnEnter = vi.fn()
      const bOnLeave = vi.fn()
      const cOnEnter = vi.fn()

      const rootRoute = new BaseRootRoute({})
      const aRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/a',
        onLeave: aOnLeave,
      })
      const bRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/b',
        pendingMs: 0,
        pendingComponent: () => null,
        loader: ({ abortController }) => abortAwareGate(abortController.signal),
        onEnter: bOnEnter,
        onLeave: bOnLeave,
      })
      const cRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/c',
        onEnter: cOnEnter,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([aRoute, bRoute, cRoute]),
        history: createMemoryHistory({ initialEntries: ['/a'] }),
      })

      if (prepopulateActiveLane) {
        // Hydration publishes an already-terminal active lane before the first
        // normal client load. The first navigation must seed semantic ownership
        // from it before pending presentation can replace the active store.
        router.stores.setMatches(router.matchRoutes(router.latestLocation))
        router.stores.resolvedLocation.set(router.latestLocation)
      } else {
        await router.load()
      }
      aOnLeave.mockClear()

      const bNavigation = router.navigate({ to: '/b' })
      await vi.waitFor(() =>
        expect(router.state.matches.at(-1)).toMatchObject({
          routeId: bRoute.id,
          status: 'pending',
        }),
      )

      await router.navigate({ to: '/c' })
      await bNavigation

      expect(router.state.matches.at(-1)?.routeId).toBe(cRoute.id)
      expect(aOnLeave).toHaveBeenCalledTimes(1)
      expect(bOnEnter).not.toHaveBeenCalled()
      expect(bOnLeave).not.toHaveBeenCalled()
      expect(cOnEnter).toHaveBeenCalledTimes(1)
    },
  )

  test('a shallow regular error wins over a deeper concurrent notFound', async () => {
    const parentError = new Error('parent failed')
    const childHead = vi.fn(() => ({
      meta: [{ title: 'unreachable child' }],
    }))
    const childOnEnter = vi.fn()

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: () => {
        throw parentError
      },
      errorComponent: () => null,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: () => {
        throw notFound()
      },
      notFoundComponent: () => null,
      head: childHead,
      onEnter: childOnEnter,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    })

    await router.load()

    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      parentRoute.id,
    ])
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: parentRoute.id,
      status: 'error',
      error: parentError,
    })
    expect(childHead).not.toHaveBeenCalled()
    expect(childOnEnter).not.toHaveBeenCalled()
  })

  test('a redirect aborts the discarded loader generation before pending UI publishes', async () => {
    let redirectSignal: AbortSignal | undefined

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const sourceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/source',
      loader: ({ abortController }) => {
        redirectSignal = abortController.signal
        throw redirect({ to: '/target' })
      },
    })
    const targetRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/target',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, sourceRoute, targetRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.navigate({ to: '/source' })

    expect(router.state.location.pathname).toBe('/target')
    expect(router.state.matches.at(-1)?.routeId).toBe(targetRoute.id)
    expect(redirectSignal?.aborted).toBe(true)
  })

  test('trimming a successful descendant aborts its discarded loader generation', async () => {
    const parentError = new Error('parent failed')
    let childSignal: AbortSignal | undefined
    let deferredRequestAborted = false

    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: () => {
        throw parentError
      },
      errorComponent: () => null,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: ({ abortController }) => {
        childSignal = abortController.signal
        const deferredRequest = new Promise<'aborted'>((resolve) => {
          abortController.signal.addEventListener(
            'abort',
            () => {
              deferredRequestAborted = true
              resolve('aborted')
            },
            { once: true },
          )
        })
        return { deferredRequest }
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    })

    await router.load()

    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: parentRoute.id,
      status: 'error',
      error: parentError,
    })
    expect(childSignal?.aborted).toBe(true)
    expect(deferredRequestAborted).toBe(true)
  })

  test('preload trimming aborts a successful descendant owned only by the discarded lane', async () => {
    const parentError = new Error('preload parent failed')
    let childSignal: AbortSignal | undefined

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      loader: () => {
        throw parentError
      },
      errorComponent: () => null,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      loader: ({ abortController }) => {
        childSignal = abortController.signal
        return {
          deferredRequest: new Promise<'aborted'>((resolve) => {
            abortController.signal.addEventListener(
              'abort',
              () => resolve('aborted'),
              { once: true },
            )
          }),
        }
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        parentRoute.addChildren([childRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.preloadRoute({ to: '/parent/child' })

    expect(childSignal?.aborted).toBe(true)
    expect(
      router.stores.cachedMatches
        .get()
        .some((match) => match.routeId === childRoute.id),
    ).toBe(false)
  })

  test('navigation started by route context cannot be overwritten by the stale matching pass', async () => {
    const bLoaderGate = createControlledPromise<void>()
    const bLoader = vi.fn(() => bLoaderGate)
    let retainedLoaderSignal: AbortSignal | undefined
    let abandonedContextSignal: AbortSignal | undefined
    let redirected = false

    const rootRoute = new BaseRootRoute({
      staleTime: Infinity,
      loader: ({ abortController }) => {
        retainedLoaderSignal = abortController.signal
        return 'root data'
      },
    })
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const aRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/a',
      context: ({ navigate, abortController }) => {
        abandonedContextSignal = abortController.signal
        if (!redirected) {
          redirected = true
          void navigate({ to: '/b' })
        }
        return { fromA: true }
      },
    })
    const bRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/b',
      loader: bLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, aRoute, bRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const navigation = router.navigate({ to: '/a' })
    await vi.waitFor(() => expect(bLoader).toHaveBeenCalledTimes(1))

    bLoaderGate.resolve()
    await navigation

    expect(router.state.location.pathname).toBe('/b')
    expect(router.state.matches.at(-1)?.routeId).toBe(bRoute.id)
    expect(abandonedContextSignal?.aborted).toBe(true)
    expect(retainedLoaderSignal?.aborted).toBe(false)
  })

  test('a context failure aborts pass controllers from the partial preflight lane', async () => {
    const contextError = new Error('context failed after starting work')
    const unhandledRejection = vi.fn()
    process.on('unhandledRejection', unhandledRejection)
    testCleanups.push(() => {
      process.off('unhandledRejection', unhandledRejection)
    })

    let contextSignal: AbortSignal | undefined
    let contextWorkAborted = false

    const rootRoute = new BaseRootRoute({})
    const brokenRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/broken',
      context: ({ abortController }) => {
        contextSignal = abortController.signal
        abortController.signal.addEventListener(
          'abort',
          () => {
            contextWorkAborted = true
          },
          { once: true },
        )
        throw contextError
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([brokenRoute]),
      history: createMemoryHistory({ initialEntries: ['/broken'] }),
    })

    await router.load()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(unhandledRejection).toHaveBeenCalledWith(
      contextError,
      expect.anything(),
    )
    expect(contextSignal?.aborted).toBe(true)
    expect(contextWorkAborted).toBe(true)
    expect(router.stores.isLoading.get()).toBe(false)
  })

  test('a failed preflight cannot abort and strand the pending lane it attempted to supersede', async () => {
    const unhandledRejection = vi.fn()
    process.on('unhandledRejection', unhandledRejection)
    testCleanups.push(() => {
      process.off('unhandledRejection', unhandledRejection)
    })

    const preflightError = new Error('next loaderDeps failed')
    const pendingGate = createControlledPromise<void>()
    let pendingSignal: AbortSignal | undefined

    const rootRoute = new BaseRootRoute({})
    const aRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/a',
    })
    const pendingRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/pending',
      pendingMs: 0,
      pendingComponent: () => null,
      loader: ({ abortController }) => {
        pendingSignal = abortController.signal
        return Promise.race([
          pendingGate,
          abortAwareGate(abortController.signal),
        ])
      },
    })
    const brokenRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/broken',
      loaderDeps: (): Record<string, never> => {
        throw preflightError
      },
      loader: () => 'never runs',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([aRoute, pendingRoute, brokenRoute]),
      history: createMemoryHistory({ initialEntries: ['/a'] }),
    })

    await router.load()
    const pendingNavigation = router.navigate({ to: '/pending' })
    await vi.waitFor(() =>
      expect(router.state.matches.at(-1)).toMatchObject({
        routeId: pendingRoute.id,
        status: 'pending',
      }),
    )

    const brokenNavigation = router.navigate({ to: '/broken' })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(unhandledRejection).toHaveBeenCalledWith(
      preflightError,
      expect.anything(),
    )
    expect(pendingSignal?.aborted).toBe(false)
    expect(router.stores.isLoading.get()).toBe(true)

    pendingGate.resolve()
    await Promise.all([pendingNavigation, brokenNavigation])

    expect(router.stores.isLoading.get()).toBe(false)
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: pendingRoute.id,
      status: 'success',
    })
  })

  test('forcePending exposes pending route state before pendingMs and settles after the replacement loader', async () => {
    const reloadGate = createControlledPromise<void>()
    let loaderCalls = 0

    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      pendingMs: 1_000,
      pendingComponent: () => null,
      loader: async () => {
        loaderCalls++
        if (loaderCalls > 1) {
          await reloadGate
        }
        return loaderCalls
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })

    await router.load()

    let invalidationSettled = false
    const invalidation = router.invalidate({ forcePending: true }).then(() => {
      invalidationSettled = true
    })

    await vi.waitFor(() =>
      expect(router.state.matches.at(-1)).toMatchObject({
        routeId: pageRoute.id,
        status: 'pending',
      }),
    )
    expect(invalidationSettled).toBe(false)

    reloadGate.resolve()
    await invalidation

    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: pageRoute.id,
      status: 'success',
      loaderData: 2,
    })
  })
})
