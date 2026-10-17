import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, lazyFn, redirect } from '../src'
import { createTestRouter } from './routerTestUtils'
import type { AnyRouteMatch } from '../src'

const findMatch = (
  matches: Array<AnyRouteMatch>,
  routeId: string,
): AnyRouteMatch | undefined =>
  matches.find((match) => match.routeId === routeId)

describe('client lane: lifecycle object form', () => {
  test('runs object-form handlers for context, beforeLoad and loader', async () => {
    const context = vi.fn(() => ({ fromContext: 'ctx' }))
    const beforeLoad = vi.fn(({ context }: { context: any }) => ({
      fromBeforeLoad: `${context.fromContext}!`,
    }))
    const loader = vi.fn(({ context }: { context: any }) => ({
      seen: [context.fromContext, context.fromBeforeLoad],
    }))
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      context: { handler: context },
      beforeLoad: { handler: beforeLoad },
      loader: { handler: loader },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })

    await router.load()

    expect(context).toHaveBeenCalledTimes(1)
    expect(beforeLoad).toHaveBeenCalledTimes(1)
    expect(loader).toHaveBeenCalledTimes(1)
    expect(findMatch(router.state.matches, pageRoute.id)).toMatchObject({
      status: 'success',
      context: { fromContext: 'ctx', fromBeforeLoad: 'ctx!' },
      loaderData: { seen: ['ctx', 'ctx!'] },
    })
  })

  test('awaits an async context before beforeLoad, the loader and the child context', async () => {
    const order: Array<string> = []
    const rootRoute = new BaseRootRoute({})
    const parentRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/parent',
      context: {
        handler: async ({ params }) => {
          order.push('parent context start')
          await new Promise((resolve) => setTimeout(resolve, 5))
          order.push('parent context end')
          return { parentValue: `parent:${Object.keys(params).length}` }
        },
      },
      beforeLoad: ({ context }) => {
        order.push('parent beforeLoad')
        return { guard: `${context.parentValue}/guard` }
      },
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => parentRoute,
      path: '/child',
      // Function form may be async as well.
      context: async ({ context }) => {
        order.push('child context')
        await Promise.resolve()
        return { childValue: `${context.guard}/child` }
      },
      loader: ({ context }) => {
        order.push('child loader')
        return context.childValue
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([parentRoute.addChildren([childRoute])]),
      history: createMemoryHistory({ initialEntries: ['/parent/child'] }),
    })

    await router.load()

    expect(order).toEqual([
      'parent context start',
      'parent context end',
      'parent beforeLoad',
      'child context',
      'child loader',
    ])
    expect(findMatch(router.state.matches, childRoute.id)).toMatchObject({
      status: 'success',
      context: {
        parentValue: 'parent:0',
        guard: 'parent:0/guard',
        childValue: 'parent:0/guard/child',
      },
      loaderData: 'parent:0/guard/child',
    })
  })

  test('a sync context yields no microtask before the next route runs', async () => {
    const order: Array<string> = []
    const rootRoute = new BaseRootRoute({
      context: () => {
        queueMicrotask(() => order.push('micro'))
        order.push('root')
        return {}
      },
    })
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      context: () => {
        order.push('page')
        return {}
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })

    await router.load()

    expect(order).toEqual(['root', 'page', 'micro'])
  })

  test('presents pending state while a non-retained async context resolves', async () => {
    let resolveContext!: (value: { ready: boolean }) => void
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      pendingMs: 0,
      pendingComponent: () => 'pending',
      context: () =>
        new Promise<{ ready: boolean }>((resolve) => {
          resolveContext = resolve
        }),
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await router.load()

    const navigation = router.navigate({ to: '/page' })
    await vi.waitFor(() => {
      expect(findMatch(router.state.matches, pageRoute.id)?.status).toBe(
        'pending',
      )
    })

    resolveContext({ ready: true })
    await navigation

    expect(findMatch(router.state.matches, pageRoute.id)).toMatchObject({
      status: 'success',
      context: { ready: true },
    })
  })

  test('an error thrown by an async context becomes an error match', async () => {
    const error = new Error('context failed')
    const onError = vi.fn()
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      context: {
        handler: async () => {
          await Promise.resolve()
          throw error
        },
      },
      onError,
      errorComponent: () => 'error',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })

    await router.load()

    expect(onError).toHaveBeenCalledWith(error)
    expect(findMatch(router.state.matches, pageRoute.id)).toMatchObject({
      status: 'error',
      error,
    })
  })

  test.each([
    [
      'throws',
      () => {
        throw new Error('context failed')
      },
    ],
    [
      'rejects',
      async () => {
        await Promise.resolve()
        throw new Error('context failed')
      },
    ],
  ])(
    'a navigation whose context %s keeps the inherited context on the error match',
    async (_, handler) => {
      const rootRoute = new BaseRootRoute({
        context: () => ({ fromRoot: 'r' }),
      })
      const homeRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
      })
      const pageRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/page',
        context: { handler },
        errorComponent: () => 'error',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([homeRoute, pageRoute]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
        context: { queryClient: 'qc' },
      })
      await router.load()

      await router.navigate({ to: '/page' })

      expect(findMatch(router.state.matches, pageRoute.id)).toMatchObject({
        status: 'error',
        error: new Error('context failed'),
        context: { queryClient: 'qc', fromRoot: 'r' },
      })
    },
  )

  // An object-form loader cannot be split as a whole: its `dehydrate` and
  // `hydrate` must be readable before the chunk loads.
  test('a lazily imported object-form loader fails with an error that says where to write it', async () => {
    const handler = vi.fn(() => 'data')
    const rootRoute = new BaseRootRoute({})
    const homeRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      errorComponent: () => 'error',
      loader: lazyFn(
        () => Promise.resolve({ loader: { handler } as any }),
        'loader',
      ),
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([homeRoute, pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await router.load()

    await router.navigate({ to: '/page' })

    expect(handler).not.toHaveBeenCalled()
    expect(findMatch(router.state.matches, pageRoute.id)).toMatchObject({
      status: 'error',
      error: new Error(
        'TanStack Router: the lazily imported `loader` is an object-form loader, which cannot be code split as a whole. Write it in the route file, inline or in a `const` there.',
      ),
    })
  })

  test('a redirect thrown by an async context is followed', async () => {
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      context: async () => {
        await Promise.resolve()
        throw redirect({ to: '/target' })
      },
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

    expect(router.state.location.pathname).toBe('/target')
    expect(router.state.matches.map((match) => match.routeId)).toEqual([
      rootRoute.id,
      targetRoute.id,
    ])
  })

  test('context receives the router additionalContext', async () => {
    const context = vi.fn(() => ({}))
    const rootRoute = new BaseRootRoute({
      context: { handler: context },
    })
    const router = createTestRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/'] }),
      additionalContext: { serverContext: { request: 'req' } },
    })

    await router.load()

    expect(context).toHaveBeenCalledWith(
      expect.objectContaining({
        serverContext: { request: 'req' },
        deps: '',
        routeId: rootRoute.id,
      }),
    )
  })
})

describe('client lane: context revalidate on router.invalidate()', () => {
  function setup(
    contextOption: any,
    options?: { staleTime?: number; loader?: boolean },
  ) {
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      context: contextOption,
      staleTime: options?.staleTime,
      loader: options?.loader === false ? undefined : () => 'data',
    })
    const otherRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/other',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute, otherRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })
    return {
      router,
      pageRoute,
      getContext: () => findMatch(router.state.matches, pageRoute.id)?.context,
    }
  }

  test('function form and object form without revalidate are computed once per match', async () => {
    for (const form of ['function', 'object'] as const) {
      let runs = 0
      const handler = () => ({ runs: ++runs })
      const { router, getContext } = setup(
        form === 'function' ? handler : { handler },
      )

      await router.load()
      expect(getContext()).toEqual({ runs: 1 })

      // A same-location load re-contextualizes the match but keeps the memo.
      await router.load()
      expect(getContext()).toEqual({ runs: 1 })

      // Invalidation re-runs the loader, never the context.
      await router.invalidate()
      expect(getContext()).toEqual({ runs: 1 })

      // A cached match keeps its contribution across navigations.
      await router.navigate({ to: '/other' })
      await router.navigate({ to: '/page' })
      expect(getContext()).toEqual({ runs: 1 })
      expect(runs).toBe(1)
    }
  })

  test('revalidate: true re-runs the handler on router.invalidate() only', async () => {
    let runs = 0
    const { router, getContext, pageRoute } = setup(
      { handler: () => ({ runs: ++runs }), revalidate: true },
      { staleTime: 0 },
    )

    await router.load()
    expect(getContext()).toEqual({ runs: 1 })

    // Staleness alone never triggers it.
    await new Promise((resolve) => setTimeout(resolve, 5))
    await router.load()
    expect(getContext()).toEqual({ runs: 1 })

    await router.invalidate()
    expect(getContext()).toEqual({ runs: 2 })
    expect(findMatch(router.state.matches, pageRoute.id)).toMatchObject({
      status: 'success',
      invalid: false,
    })

    await router.invalidate()
    expect(getContext()).toEqual({ runs: 3 })
    expect(runs).toBe(3)
  })

  test('revalidate function receives prev and replaces the contribution', async () => {
    const handler = vi.fn(() => ({ stable: { id: 1 }, counter: 0 }))
    const revalidate = vi.fn(async ({ prev }: { prev: any }) => {
      await Promise.resolve()
      return { stable: prev.stable, counter: prev.counter + 1 }
    })
    const { router, getContext } = setup({ handler, revalidate })

    await router.load()
    const first = getContext()
    expect(first).toEqual({ stable: { id: 1 }, counter: 0 })

    await router.invalidate()
    const second = getContext()
    expect(second).toEqual({ stable: { id: 1 }, counter: 1 })
    // Sub-identities survive when the route opts in and keeps them.
    expect(second?.stable).toBe(first?.stable)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(revalidate).toHaveBeenCalledTimes(1)
    expect(revalidate).toHaveBeenCalledWith(
      expect.objectContaining({
        prev: first,
        deps: '',
        params: {},
      }),
    )

    // Without invalidation the revalidated contribution is the memo.
    await router.load()
    expect(getContext()).toEqual(second)
    expect(getContext()?.stable).toBe(first?.stable)
    expect(revalidate).toHaveBeenCalledTimes(1)
  })

  test('revalidate applies to routes without a loader as well', async () => {
    let runs = 0
    const { router, getContext } = setup(
      { handler: () => ({ runs: ++runs }), revalidate: true },
      { loader: false },
    )

    await router.load()
    await router.invalidate()

    expect(getContext()).toEqual({ runs: 2 })
    await router.load()
    expect(getContext()).toEqual({ runs: 2 })
  })

  test('a loader failure retried by router.load() does not re-run the context; router.invalidate() does', async () => {
    let fail = true
    const rootRoute = new BaseRootRoute({})
    const trueHandler = vi.fn(() => ({ runs: trueHandler.mock.calls.length }))
    const fnHandler = vi.fn(() => ({ stable: 1 }))
    const revalidate = vi.fn(({ prev }: { prev: any }) => ({
      stable: (prev?.stable ?? 0) + 1,
    }))
    const trueRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/true',
      context: { handler: trueHandler, revalidate: true },
      errorComponent: () => 'error',
      loader: () => {
        if (fail) {
          throw new Error('loader failed')
        }
        return 'data'
      },
    })
    const fnRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/fn',
      context: { handler: fnHandler, revalidate },
      errorComponent: () => 'error',
      loader: () => {
        if (fail) {
          throw new Error('loader failed')
        }
        return 'data'
      },
    })
    for (const [route, handler, path] of [
      [trueRoute, trueHandler, '/true'],
      [fnRoute, fnHandler, '/fn'],
    ] as const) {
      fail = true
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([trueRoute, fnRoute]),
        history: createMemoryHistory({ initialEntries: [path] }),
      })

      await router.load()
      expect(findMatch(router.state.matches, route.id)).toMatchObject({
        status: 'error',
        invalid: true,
      })
      expect(handler).toHaveBeenCalledTimes(1)

      // The retry only re-runs the loader (`match.invalid` is set, but the
      // context was not invalidated).
      fail = false
      await router.load()
      expect(findMatch(router.state.matches, route.id)).toMatchObject({
        status: 'success',
        loaderData: 'data',
      })
      expect(handler).toHaveBeenCalledTimes(1)
      expect(revalidate).not.toHaveBeenCalled()

      await router.invalidate()
      if (route === trueRoute) {
        expect(handler).toHaveBeenCalledTimes(2)
        expect(findMatch(router.state.matches, route.id)?.context).toEqual({
          runs: 2,
        })
      } else {
        expect(handler).toHaveBeenCalledTimes(1)
        expect(revalidate).toHaveBeenCalledTimes(1)
        expect(revalidate).toHaveBeenCalledWith(
          expect.objectContaining({ prev: { stable: 1 } }),
        )
        expect(findMatch(router.state.matches, route.id)?.context).toEqual({
          stable: 2,
        })
      }
    }
  })

  test('a shouldReload throw does not re-run the context', async () => {
    let throwOnce = true
    const handler = vi.fn(() => ({ value: 'ctx' }))
    const rootRoute = new BaseRootRoute({})
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      context: { handler, revalidate: true },
      errorComponent: () => 'error',
      shouldReload: () => {
        if (throwOnce) {
          throwOnce = false
          throw new Error('shouldReload failed')
        }
        return false
      },
      loader: () => 'data',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })

    await router.load()
    expect(findMatch(router.state.matches, pageRoute.id)?.status).toBe(
      'success',
    )
    // A same-location load consults shouldReload, which throws once.
    await router.load()
    expect(findMatch(router.state.matches, pageRoute.id)).toMatchObject({
      status: 'error',
      invalid: true,
    })

    await router.load()
    expect(findMatch(router.state.matches, pageRoute.id)?.status).toBe(
      'success',
    )
    expect(handler).toHaveBeenCalledTimes(1)

    await router.invalidate()
    expect(handler).toHaveBeenCalledTimes(2)
  })

  test('a revalidate function receives prev undefined after the handler threw on the previous load', async () => {
    let throwOnce = true
    const handler = vi.fn(() => {
      if (throwOnce) {
        throwOnce = false
        throw new Error('context failed')
      }
      return { fromHandler: true }
    })
    const revalidate = vi.fn(({ prev }: { prev: any }) => ({
      fromRevalidate: true,
      prev,
    }))
    const { router, getContext, pageRoute } = setup({ handler, revalidate })

    await router.load()
    expect(findMatch(router.state.matches, pageRoute.id)?.status).toBe('error')
    expect(handler).toHaveBeenCalledTimes(1)

    await router.invalidate()

    expect(revalidate).toHaveBeenCalledTimes(1)
    expect(revalidate.mock.calls[0]![0]).toHaveProperty('prev', undefined)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(findMatch(router.state.matches, pageRoute.id)?.status).toBe(
      'success',
    )
    expect(getContext()).toEqual({ fromRevalidate: true, prev: undefined })
  })

  test('a failed revalidation is retried by the next load', async () => {
    let throwOnce = true
    const handler = vi.fn(() => ({ counter: 0 }))
    const revalidate = vi.fn(({ prev }: { prev: any }) => {
      if (throwOnce) {
        throwOnce = false
        throw new Error('revalidate failed')
      }
      return { counter: prev.counter + 1 }
    })
    const { router, getContext, pageRoute } = setup({ handler, revalidate })

    await router.load()
    await router.invalidate()
    expect(findMatch(router.state.matches, pageRoute.id)?.status).toBe('error')
    expect(revalidate).toHaveBeenCalledTimes(1)

    // The invalidation was not fulfilled, so a plain load retries it instead
    // of reusing the memo the user asked to refresh.
    await router.load()
    expect(revalidate).toHaveBeenCalledTimes(2)
    expect(getContext()).toEqual({ counter: 1 })

    await router.load()
    expect(revalidate).toHaveBeenCalledTimes(2)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  test('an invalidate filter scopes revalidation to the selected matches', async () => {
    let rootRuns = 0
    let pageRuns = 0
    const rootRoute = new BaseRootRoute({
      context: { handler: () => ({ rootRuns: ++rootRuns }), revalidate: true },
    })
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
      context: { handler: () => ({ pageRuns: ++pageRuns }), revalidate: true },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/page'] }),
    })

    await router.load()
    await router.invalidate({
      filter: (match) => match.routeId === pageRoute.id,
    })

    expect(findMatch(router.state.matches, pageRoute.id)?.context).toEqual({
      rootRuns: 1,
      pageRuns: 2,
    })
  })

  test('router.invalidate() marks a cached match: returning to it revalidates once', async () => {
    for (const form of ['true', 'function'] as const) {
      let runs = 0
      const handler = vi.fn(() => ({ runs: ++runs }))
      const revalidate = vi.fn(({ prev }: { prev: any }) => ({
        runs: prev.runs + 100,
      }))
      const { router, getContext } = setup(
        form === 'true'
          ? { handler, revalidate: true }
          : { handler, revalidate },
      )

      await router.load()
      await router.navigate({ to: '/other' })
      await router.invalidate()
      await router.navigate({ to: '/page' })

      if (form === 'true') {
        expect(handler).toHaveBeenCalledTimes(2)
        expect(getContext()).toEqual({ runs: 2 })
      } else {
        expect(handler).toHaveBeenCalledTimes(1)
        expect(revalidate).toHaveBeenCalledTimes(1)
        // The cached contribution is `prev`.
        expect(revalidate).toHaveBeenCalledWith(
          expect.objectContaining({ prev: { runs: 1 } }),
        )
        expect(getContext()).toEqual({ runs: 101 })
      }

      // The mark is consumed: leaving and returning keeps the result.
      await router.navigate({ to: '/other' })
      await router.navigate({ to: '/page' })
      expect(handler.mock.calls.length + revalidate.mock.calls.length).toBe(2)
    }
  })

  test('an async revalidation keeps the mounted match out of pending', async () => {
    for (const form of ['true', 'function'] as const) {
      let release!: () => void
      let gate: Promise<void> | undefined
      let runs = 0
      const run = async () => {
        await gate
        return { runs: ++runs }
      }
      const rootRoute = new BaseRootRoute({})
      const pageRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/page',
        pendingMs: 0,
        pendingComponent: () => 'pending',
        context:
          form === 'true'
            ? { handler: run, revalidate: true }
            : { handler: run, revalidate: run },
        loader: () => 'data',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([pageRoute]),
        history: createMemoryHistory({ initialEntries: ['/page'] }),
      })
      await router.load()

      gate = new Promise((resolve) => (release = resolve))
      const statuses: Array<string | undefined> = []
      const setMatches = router.stores.setMatches
      vi.spyOn(router.stores, 'setMatches').mockImplementation((matches) => {
        statuses.push(findMatch(matches, pageRoute.id)?.status)
        setMatches(matches)
      })
      const invalidation = router.invalidate()
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(findMatch(router.state.matches, pageRoute.id)?.status).toBe(
        'success',
      )
      release()
      await invalidation

      expect(statuses).not.toContain('pending')
      expect(findMatch(router.state.matches, pageRoute.id)).toMatchObject({
        status: 'success',
        context: { runs: 2 },
      })
    }
  })

  // `router.update({ routeTree })` replaces `routesById` while the committed
  // and cached matches of the previous tree are retained.
  describe('after router.update({ routeTree }) removed the route of a retained match', () => {
    function setupReplaceable(loader: () => unknown) {
      const rootRoute = new BaseRootRoute({})
      const pageRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/page',
        context: { handler: () => ({ value: 1 }), revalidate: true },
        loader,
      })
      const otherRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/other',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([pageRoute, otherRoute]),
        history: createMemoryHistory({ initialEntries: ['/page'] }),
      })
      const replaceRouteTree = () => {
        const nextRoot = new BaseRootRoute({})
        const nextOther = new BaseRoute({
          getParentRoute: () => nextRoot,
          path: '/other',
        })
        router.update({ routeTree: nextRoot.addChildren([nextOther]) } as any)
        expect((router.routesById as any)[pageRoute.id]).toBeUndefined()
      }
      return { router, pageRoute, replaceRouteTree }
    }

    test('invalidate() does not throw for a committed error match', async () => {
      const { router, pageRoute, replaceRouteTree } = setupReplaceable(() => {
        throw new Error('page failed')
      })
      await router.load()
      expect(findMatch(router.state.matches, pageRoute.id)?.status).toBe(
        'error',
      )

      replaceRouteTree()

      await expect(router.invalidate()).resolves.toBeUndefined()
      expect(router.state.status).toBe('idle')
      expect(findMatch(router.state.matches, pageRoute.id)).toBeUndefined()
    })

    test('invalidate() does not throw for a cached success match', async () => {
      const { router, pageRoute, replaceRouteTree } = setupReplaceable(
        () => 'data',
      )
      await router.load()
      await router.navigate({ to: '/other' })
      expect(router.state.matches.map((match) => match.routeId)).not.toContain(
        pageRoute.id,
      )

      replaceRouteTree()

      await expect(router.invalidate()).resolves.toBeUndefined()
      expect(router.state.status).toBe('idle')
      expect(router.state.location.pathname).toBe('/other')
    })
  })
})

describe('client lane: a context result outlives a lane that does not commit', () => {
  function setup(options: {
    initial: string
    revalidate?: boolean
    layoutLoader?: boolean
  }) {
    let redirectDash = false
    const handler = vi.fn(async () => {
      await Promise.resolve()
      return { redirectDash }
    })
    const rootRoute = new BaseRootRoute({})
    const otherRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/other',
    })
    const authedRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      id: '_authed',
      context: { handler, revalidate: options.revalidate },
      loader: options.layoutLoader ? () => 'layout' : undefined,
    })
    const dashRoute = new BaseRoute({
      getParentRoute: () => authedRoute,
      path: '/dash',
      beforeLoad: ({ context }) => {
        if (context.redirectDash) {
          throw redirect({ to: '/welcome' })
        }
      },
    })
    const welcomeRoute = new BaseRoute({
      getParentRoute: () => authedRoute,
      path: '/welcome',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        otherRoute,
        authedRoute.addChildren([dashRoute, welcomeRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: [options.initial] }),
    })
    return {
      router,
      handler,
      authedRoute,
      redirectDashNextRun: () => (redirectDash = true),
    }
  }

  test('one router.invalidate() revalidates once when the lane redirects inside the layout', async () => {
    const { router, handler, authedRoute, redirectDashNextRun } = setup({
      initial: '/dash',
      revalidate: true,
    })
    await router.load()
    expect(handler).toHaveBeenCalledTimes(1)

    redirectDashNextRun()
    await router.invalidate()

    expect(router.state.location.pathname).toBe('/welcome')
    expect(findMatch(router.state.matches, authedRoute.id)?.context).toEqual({
      redirectDash: true,
    })
    expect(handler).toHaveBeenCalledTimes(2)
  })

  test('navigating into a redirect inside the layout runs its async context once', async () => {
    const { router, handler, redirectDashNextRun } = setup({
      initial: '/other',
    })
    redirectDashNextRun()
    await router.load()

    await router.navigate({ to: '/dash' })

    expect(router.state.location.pathname).toBe('/welcome')
    expect(handler).toHaveBeenCalledTimes(1)
  })

  test.each([false, true])(
    'preloadRoute then navigate runs the layout context once (layout loader: %s)',
    async (layoutLoader) => {
      const { router, handler } = setup({ initial: '/other', layoutLoader })
      await router.load()

      await router.preloadRoute({ to: '/dash' })
      expect(handler).toHaveBeenCalledTimes(1)

      await router.navigate({ to: '/dash' })

      expect(router.state.location.pathname).toBe('/dash')
      expect(handler).toHaveBeenCalledTimes(1)
    },
  )

  test('a preload context that resolves after the navigation committed does not replace the committed context', async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    let runs = 0
    const rootRoute = new BaseRootRoute({})
    const otherRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/other',
    })
    const authedRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      id: '_authed',
      context: {
        handler: async () => {
          const run = ++runs
          // The preload's run is the slow one.
          await sleep(run === 1 ? 60 : 5)
          return { run }
        },
      },
      loader: () => 'layout',
    })
    const aRoute = new BaseRoute({
      getParentRoute: () => authedRoute,
      path: '/a',
    })
    const bRoute = new BaseRoute({
      getParentRoute: () => authedRoute,
      path: '/b',
      loader: () => sleep(30).then(() => 'b'),
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        otherRoute,
        authedRoute.addChildren([aRoute, bRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/other'] }),
      defaultPendingMs: 0,
    })
    await router.load()

    const preload = router.preloadRoute({ to: '/a' })
    await sleep(2)
    await router.navigate({ to: '/a' })
    await preload
    expect(findMatch(router.state.matches, authedRoute.id)?.context).toEqual({
      run: 2,
    })

    const navigation = router.navigate({ to: '/b' })
    await sleep(10)
    // Only the child is loading; the retained layout is not pending.
    expect(findMatch(router.state.matches, authedRoute.id)?.status).toBe(
      'success',
    )
    await navigation

    expect(findMatch(router.state.matches, authedRoute.id)?.context).toEqual({
      run: 2,
    })
  })
})
