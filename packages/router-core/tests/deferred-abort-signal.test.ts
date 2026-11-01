import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

afterEach(() => {
  vi.restoreAllMocks()
})

function expectAbortError(signal: AbortSignal) {
  expect(signal.aborted).toBe(true)
  expect(signal.reason).toMatchObject({ name: 'AbortError', code: 20 })
}

function expectReason(signal: AbortSignal, reason: unknown) {
  expect(signal.aborted).toBe(true)
  expect(Object.is(signal.reason, reason)).toBe(true)
  let thrown: unknown = 'not thrown'
  try {
    signal.throwIfAborted()
  } catch (error) {
    thrown = error
  }
  expect(Object.is(thrown, reason)).toBe(true)
}

// Public contract: a router abort controller whose signal is first read after
// the router retired it still exposes an aborted signal with the standard
// AbortError reason, and later public aborts cannot replace that reason.
test('retired controllers expose aborted signals when first read later', async () => {
  const loaderControllers: Array<AbortController> = []
  const beforeLoadControllers: Array<AbortController> = []
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const postRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/posts/$id',
    beforeLoad: ({ abortController }) => {
      beforeLoadControllers.push(abortController)
    },
    loader: ({ abortController }) => {
      loaderControllers.push(abortController)
      return 'data'
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, postRoute]),
    history: createMemoryHistory({ initialEntries: ['/posts/1'] }),
  })

  await router.load()
  const presented = router.state.matches.at(-1)!.abortController
  await router.navigate({ to: '/posts/$id', params: { id: '2' } })
  await router.navigate({ to: '/' })

  expect(loaderControllers).toHaveLength(2)
  expect(beforeLoadControllers).toHaveLength(2)
  for (const controller of [
    ...loaderControllers,
    ...beforeLoadControllers,
    presented,
  ]) {
    controller.abort(new Error('late public abort'))
    expectAbortError(controller.signal)
  }
})

test('a signal read before retirement dispatches abort when retired', async () => {
  const events: Array<string> = []
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const postsRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/posts',
    loader: ({ abortController }) => {
      abortController.signal.addEventListener('abort', () => {
        events.push('loader')
        expectAbortError(abortController.signal)
      })
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, postsRoute]),
    history: createMemoryHistory({ initialEntries: ['/posts'] }),
  })

  await router.load()
  expect(events).toEqual([])
  await router.navigate({ to: '/' })
  expect(events).toEqual(['loader'])
})

// The router retires at least one controller per navigation. Native aborts are
// costly in Chromium and Node because each one formats an AbortError stack, so
// they only happen once a signal has been read.
test('retiring unread signals skips the native abort until a signal is read', async () => {
  const nativeAbort = vi.spyOn(AbortController.prototype, 'abort')
  const loaderControllers: Array<AbortController> = []
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const postRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/posts/$id',
    beforeLoad: () => ({ ready: true }),
    loader: async ({ abortController }) => {
      loaderControllers.push(abortController)
      await Promise.resolve()
      return 'data'
    },
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute, postRoute]),
    history: createMemoryHistory({ initialEntries: ['/posts/1'] }),
  })

  await router.load()
  await router.preloadRoute({ to: '/posts/$id', params: { id: '3' } })
  await router.navigate({ to: '/posts/$id', params: { id: '2' } })
  await router.invalidate()
  router.clearCache()
  await router.navigate({ to: '/' })

  expect(loaderControllers.length).toBeGreaterThan(2)
  expect(nativeAbort).not.toHaveBeenCalled()
  expectAbortError(loaderControllers[0]!.signal)
  expect(nativeAbort).toHaveBeenCalledOnce()
})

// Abort work registered on a read signal before the router starts waiting
// (fetch-like work) runs before the router's own cancellation cleanup, as with
// native listener ordering.
test('fetch-like abort work observes the live beforeLoad state before cancellation cleanup', async () => {
  let armed = false
  let controller!: AbortController
  const seen: Array<unknown> = []
  const rootRoute = new BaseRootRoute({})
  const homeRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    beforeLoad: ({ abortController }) => {
      if (!armed) {
        return
      }
      controller = abortController
      const signal = abortController.signal
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason))
      }).catch((error) => {
        seen.push(
          router.state.matches.find((match) => match.routeId === '/')
            ?.isFetching,
        )
        throw error
      })
    },
    loader: () => 'home',
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([homeRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  armed = true
  const invalidation = router.invalidate()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(
    router.state.matches.find((match) => match.routeId === '/')?.isFetching,
  ).toBe('beforeLoad')

  controller.abort()
  await invalidation
  expect(seen).toEqual(['beforeLoad'])
})

// Waits registered while a signal is unread must still settle when the signal
// is read later, before the router aborts it.
test.each(
  (['beforeLoad', 'loader'] as const).flatMap((where) =>
    (['clearCache', 'invalidate'] as const).flatMap((method) =>
      [false, true].map((readLate) => [where, method, readLate] as const),
    ),
  ),
)(
  'a preload waiting in its %s with an unread signal settles after %s (read late: %s)',
  async (where, method, readLate) => {
    const events: Array<string> = []
    let controller!: AbortController
    const rootRoute = new BaseRootRoute({})
    const homeRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const pendingRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/pending',
      beforeLoad: ({ abortController }) => {
        controller = abortController
        return where === 'beforeLoad' ? new Promise(() => {}) : undefined
      },
      loader: () => new Promise(() => {}),
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([homeRoute, pendingRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await router.load()
    let settled = false
    const preload = router.preloadRoute({ to: '/pending' }).then(() => {
      settled = true
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(settled).toBe(false)
    if (readLate) {
      controller.signal.addEventListener('abort', () => events.push('abort'))
    }

    if (method === 'clearCache') {
      router.clearCache()
    } else {
      await router.invalidate()
    }
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(settled).toBe(true)
    expect(events).toEqual(readLate ? ['abort'] : [])
    await preload
  },
)

// A public abort reason supplied while the signal is unread is the reason seen
// at first read, including falsy reasons, and a later router retirement cannot
// replace it.
test.each([
  ['0', 0],
  ['null', null],
  ['empty string', ''],
  ['false', false],
  ['Error', new Error('custom')],
])(
  'a loader abort reason %s given before the signal is read wins',
  async (_, reason) => {
    const controllers: Array<AbortController> = []
    const rootRoute = new BaseRootRoute({})
    const homeRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const postsRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      loader: ({ abortController }) => {
        controllers.push(abortController)
        abortController.abort(reason)
        return 'data'
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([homeRoute, postsRoute]),
      history: createMemoryHistory({ initialEntries: ['/posts'] }),
    })

    await router.load()
    expect(router.state.matches.at(-1)).toMatchObject({
      status: 'success',
      loaderData: 'data',
    })
    await router.navigate({ to: '/' })
    expectReason(controllers[0]!.signal, reason)
  },
)

// A falsy public reason still cancels the transaction it aborts.
test.each([
  ['0', 0],
  ['null', null],
  ['empty string', ''],
  ['false', false],
])(
  'a beforeLoad abort with reason %s cancels its navigation',
  async (_, reason) => {
    let loaderCalls = 0
    let controller!: AbortController
    const rootRoute = new BaseRootRoute({})
    const homeRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const postsRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      beforeLoad: ({ abortController }) => {
        controller = abortController
        abortController.abort(reason)
      },
      loader: () => {
        loaderCalls++
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([homeRoute, postsRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    void router.navigate({ to: '/posts' })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(loaderCalls).toBe(0)
    expectReason(controller.signal, reason)
  },
)

// Self-aborting a loader does not discard its result, including when a
// navigation adopts the preload that started it.
test.each([false, true])(
  'an adopted preload loader keeps its data after self-aborting (signal read: %s)',
  async (readSignal) => {
    const events: Array<string> = []
    let controller!: AbortController
    let calls = 0
    const rootRoute = new BaseRootRoute({})
    const homeRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const postsRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
      loader: async ({ abortController }) => {
        calls++
        controller = abortController
        if (readSignal) {
          abortController.signal.addEventListener('abort', () =>
            events.push('abort'),
          )
        }
        await new Promise((resolve) => setTimeout(resolve, 10))
        abortController.abort()
        return 'data'
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([homeRoute, postsRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    const preload = router.preloadRoute({ to: '/posts' })
    await new Promise((resolve) => setTimeout(resolve, 2))
    await router.navigate({ to: '/posts' })
    await preload

    expect(calls).toBe(1)
    expect(events).toEqual(readSignal ? ['abort'] : [])
    expect(router.state.matches.at(-1)).toMatchObject({
      routeId: '/posts',
      status: 'success',
      loaderData: 'data',
    })
    expectAbortError(controller.signal)
  },
)
