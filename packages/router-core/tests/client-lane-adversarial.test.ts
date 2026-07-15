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

afterEach(() => {
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

      const rootRoute = new BaseRootRoute({})
      const indexRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
      })
      const targetLoader = vi.fn(() => 'target data')
      const targetRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/target',
        loader: targetLoader,
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

      expect(laterListener).toHaveBeenCalledTimes(1)
      expect(router.state.location.pathname).toBe('/target')
      expect(router.state.matches.at(-1)).toMatchObject({
        routeId: targetRoute.id,
        status: 'success',
      })
      expect(targetLoader).toHaveBeenCalledTimes(1)
    },
  )

  test('superseding a published pending lane diffs lifecycle hooks from the last final lane', async () => {
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

    await router.load()
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
  })

  test('commits a failing parent loader without projecting its trimmed child', async () => {
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

  test('a redirect aborts the discarded loader generation', async () => {
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
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: targetRoute.id,
      status: 'success',
    })
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

    let contextSignal: AbortSignal | undefined
    let contextWorkAborted = false
    const safeLoader = vi.fn(() => 'safe data')

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
    const safeRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/safe',
      loader: safeLoader,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([brokenRoute, safeRoute]),
      history: createMemoryHistory({ initialEntries: ['/broken'] }),
    })

    await router.load()
    expect(contextSignal?.aborted).toBe(true)
    expect(contextWorkAborted).toBe(true)

    await router.navigate({ to: '/safe' })
    expect(router.state.location.pathname).toBe('/safe')
    expect(safeLoader).toHaveBeenCalledTimes(1)
  })

  test('throwing a non-aborted router signal is an error, not cancellation', async () => {
    let thrownSignal: AbortSignal | undefined
    const rootRoute = new BaseRootRoute({})
    const brokenRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/broken',
      beforeLoad: ({ abortController }) => {
        thrownSignal = abortController.signal
        throw thrownSignal
      },
      errorComponent: () => null,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([brokenRoute]),
      history: createMemoryHistory({ initialEntries: ['/broken'] }),
    })

    await router.load()

    expect(thrownSignal?.aborted).toBe(false)
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: brokenRoute.id,
      status: 'error',
      error: thrownSignal,
    })
  })

  test('a failed preflight cannot abort and strand the pending lane it attempted to supersede', async () => {
    const preflightError = new Error('next loaderDeps failed')
    const pendingGate = createControlledPromise<void>()
    const brokenPreflightReached = createControlledPromise<void>()
    let pendingSignal: AbortSignal | undefined
    const pendingStarted = createControlledPromise<void>()

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
        pendingStarted.resolve()
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
        brokenPreflightReached.resolve()
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
    await pendingStarted

    const brokenNavigation = router.navigate({ to: '/broken' })
    await brokenPreflightReached

    expect(pendingSignal?.aborted).toBe(false)

    pendingGate.resolve()
    await Promise.all([pendingNavigation, brokenNavigation])

    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: pendingRoute.id,
      status: 'success',
    })
    expect(router.state.location.pathname).toBe('/pending')
  })
})
