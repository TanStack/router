import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  createControlledPromise,
  notFound,
  redirect,
} from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

test('server route lifecycle callbacks run after loaded matches are published', async () => {
  const events: Array<string> = []
  const onEnter = vi.fn((match) => {
    events.push(`enter:${match.routeId}:${match.loaderData}`)
  })
  const onStay = vi.fn((match) => {
    events.push(`stay:${match.routeId}:${match.search.step}`)
  })
  const onLeave = vi.fn((match) => {
    events.push(`leave:${match.routeId}`)
  })
  const barEnter = vi.fn((match) => {
    events.push(`enter:${match.routeId}`)
  })

  const rootRoute = new BaseRootRoute({})
  const fooRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/foo',
    beforeLoad: () => {
      events.push('beforeLoad:/foo')
      return { ready: true }
    },
    loader: ({ context }) => {
      events.push(`loader:/foo:${context.ready}`)
      return 'foo data'
    },
    onEnter,
    onStay,
    onLeave,
  })
  const barRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/bar',
    onEnter: barEnter,
  })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([fooRoute, barRoute]),
    history: createMemoryHistory(),
    isServer: true,
  })

  expect((await loadServerResponse(router, '/foo?step=one')).status).toBe(200)
  expect(events).toEqual([
    'beforeLoad:/foo',
    'loader:/foo:true',
    `enter:${fooRoute.id}:foo data`,
  ])
  expect(onEnter).toHaveBeenCalledWith(
    expect.objectContaining({
      routeId: fooRoute.id,
      status: 'success',
      loaderData: 'foo data',
      context: expect.objectContaining({ ready: true }),
    }),
  )

  events.length = 0
  expect((await loadServerResponse(router, '/foo?step=two')).status).toBe(200)
  expect(events).toEqual([
    'beforeLoad:/foo',
    'loader:/foo:true',
    `stay:${fooRoute.id}:two`,
  ])

  events.length = 0
  expect((await loadServerResponse(router, '/bar')).status).toBe(200)
  expect(events).toEqual([`leave:${fooRoute.id}`, `enter:${barRoute.id}`])
  expect(onLeave).toHaveBeenCalledTimes(1)
  expect(barEnter).toHaveBeenCalledTimes(1)
})

describe('public server loading state', () => {
  test('a same-URL reload reports pending while previous successful matches remain published', async () => {
    const started = createControlledPromise<void>()
    const gate = createControlledPromise<string>()
    let reload = false
    const rootRoute = new BaseRootRoute({})
    const route = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/work',
      loader: () => {
        if (!reload) {
          return 'initial data'
        }
        started.resolve()
        return gate
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([route]),
      history: createMemoryHistory({ initialEntries: ['/work'] }),
      isServer: true,
    })
    await router.load()
    expect(router.state.isLoading).toBe(false)
    reload = true
    const loading = router.load()
    try {
      await started
      expect(router.state).toMatchObject({ status: 'pending', isLoading: true })
      expect(router.state.matches.at(-1)?.loaderData).toBe('initial data')
    } finally {
      gate.resolve('reloaded data')
      await loading
    }
    expect(router.state).toMatchObject({ status: 'idle', isLoading: false })
    expect(router.state.matches.at(-1)?.loaderData).toBe('reloaded data')
  })

  test.each([0, 1])(
    'overlapping loads stay pending when load %s finishes first',
    async (first) => {
      const gates = [
        createControlledPromise<string>(),
        createControlledPromise<string>(),
      ]
      const started = [
        createControlledPromise<void>(),
        createControlledPromise<void>(),
      ]
      let calls = 0
      const rootRoute = new BaseRootRoute({})
      const route = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/work',
        loader: () => {
          const index = calls++
          started[index]!.resolve()
          return gates[index]!
        },
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([route]),
        history: createMemoryHistory({ initialEntries: ['/work'] }),
        isServer: true,
      })
      const loads = [router.load()]
      await started[0]
      loads.push(router.load())
      try {
        await started[1]
        gates[first]!.resolve('first completed')
        await loads[first]
        expect(router.state).toMatchObject({
          status: 'pending',
          isLoading: true,
        })
        expect(router.state.matches.at(-1)?.loaderData).toBe('first completed')
      } finally {
        gates[0]!.resolve('all completed')
        gates[1]!.resolve('all completed')
        await Promise.all(loads)
      }
      expect(router.state).toMatchObject({ status: 'idle', isLoading: false })
    },
  )

  test('an overlapping lifecycle rejection keeps loading pending until the remaining load settles', async () => {
    const gate = createControlledPromise<string>()
    const started = createControlledPromise<void>()
    const reason = new Error('enter hook failed')
    let calls = 0
    let fail = true
    const rootRoute = new BaseRootRoute({})
    const route = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/work',
      loader: () => {
        if (++calls === 1) {
          started.resolve()
          return gate
        }
        return 'overlapping data'
      },
      onEnter: () => {
        if (fail) {
          fail = false
          throw reason
        }
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([route]),
      history: createMemoryHistory({ initialEntries: ['/work'] }),
      isServer: true,
    })
    const loading = router.load()
    try {
      await started
      await expect(router.load()).rejects.toBe(reason)
      expect(router.state).toMatchObject({ status: 'pending', isLoading: true })
      expect(router.state.matches.at(-1)?.loaderData).toBe('overlapping data')
    } finally {
      gate.resolve('completed')
      await loading
    }
    expect(router.state).toMatchObject({ status: 'idle', isLoading: false })
    expect(router.state.matches.at(-1)?.loaderData).toBe('completed')
  })

  test('a load started by a route lifecycle callback owns pending state after the outer load finishes', async () => {
    const gate = createControlledPromise<string>()
    const started = createControlledPromise<void>()
    let calls = 0
    let reenter = true
    let nested: Promise<void> | undefined
    const rootRoute = new BaseRootRoute({})
    const route = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/work',
      loader: () => {
        if (++calls === 1) {
          return 'initial data'
        }
        started.resolve()
        return gate
      },
      onEnter: () => {
        if (reenter) {
          reenter = false
          nested = router.load()
        }
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([route]),
      history: createMemoryHistory({ initialEntries: ['/work'] }),
      isServer: true,
    })
    await router.load()
    try {
      await started
      expect(router.state).toMatchObject({ status: 'pending', isLoading: true })
      expect(router.state.matches.at(-1)?.loaderData).toBe('initial data')
    } finally {
      gate.resolve('nested data')
      await nested
    }
    expect(router.state).toMatchObject({ status: 'idle', isLoading: false })
    expect(router.state.matches.at(-1)?.loaderData).toBe('nested data')
  })

  test('loading is already pending when a load event synchronously starts another load', async () => {
    const gate = createControlledPromise<string>()
    const started = createControlledPromise<void>()
    const observations: boolean[] = []
    let nested: Promise<void> | undefined
    let reenter = true
    const rootRoute = new BaseRootRoute({})
    const route = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/work',
      loader: () => {
        started.resolve()
        return gate
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([route]),
      history: createMemoryHistory({ initialEntries: ['/work'] }),
      isServer: true,
    })
    const unsubscribe = router.subscribe('onBeforeLoad', () => {
      observations.push(router.state.isLoading)
      if (reenter) {
        reenter = false
        nested = router.load()
      }
    })
    const outer = router.load()
    try {
      await started
      expect(observations).toEqual([true, true])
      expect(router.state.isLoading).toBe(true)
    } finally {
      unsubscribe()
      gate.resolve('completed')
      await Promise.all([outer, nested])
    }
    expect(router.state.isLoading).toBe(false)
  })

  test.each(['onEnter', 'onStay'] as const)(
    'restores idle after a throwing %s callback and allows a later load',
    async (phase) => {
      const reason = new Error('hook failed')
      let fail = phase === 'onEnter'
      const throwOnce = () => {
        if (fail) {
          fail = false
          throw reason
        }
      }
      const rootRoute = new BaseRootRoute({})
      const route = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/work',
        onEnter: phase === 'onEnter' ? throwOnce : undefined,
        onStay: phase === 'onStay' ? throwOnce : undefined,
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([route]),
        history: createMemoryHistory({ initialEntries: ['/work'] }),
        isServer: true,
      })
      if (phase === 'onStay') {
        await router.load()
        fail = true
      }
      await expect(router.load()).rejects.toBe(reason)
      expect(router.state).toMatchObject({ status: 'idle', isLoading: false })
      await router.load()
      expect(router.state).toMatchObject({ status: 'idle', isLoading: false })
    },
  )

  test.each([
    ['success', 200],
    ['error', 500],
    ['not-found', 404],
    ['redirect', 307],
  ] as const)(
    'settles public loading state for a server %s response',
    async (outcome, status) => {
      const observed: boolean[] = []
      const rootRoute = new BaseRootRoute({})
      const route = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/work',
        loader: () => {
          observed.push(router.state.isLoading)
          if (outcome === 'error') {
            throw new Error('loader failed')
          }
          if (outcome === 'not-found') {
            throw notFound()
          }
          if (outcome === 'redirect') {
            throw redirect({ href: '/target', statusCode: 307 })
          }
          return 'ready'
        },
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([route]),
        history: createMemoryHistory(),
        isServer: true,
      })
      const response = await loadServerResponse(router, '/work')
      expect(response.status).toBe(status)
      expect(observed).toEqual([true])
      expect(router.state).toMatchObject({ status: 'idle', isLoading: false })
    },
  )

  test('a cancelled request releases loading state without waiting for an uncooperative loader', async () => {
    const controller = new AbortController()
    const started = createControlledPromise<void>()
    const gate = createControlledPromise<string>()
    const rootRoute = new BaseRootRoute({})
    const route = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/work',
      loader: () => {
        started.resolve()
        return gate
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([route]),
      history: createMemoryHistory(),
      isServer: true,
    })
    const cancellation = new Error('request disconnected')
    const loading = loadServerResponse(router, '/work', controller.signal)
    const rejected = expect(loading).rejects.toBe(cancellation)
    try {
      await started
      expect(router.state.isLoading).toBe(true)
    } finally {
      controller.abort(cancellation)
      await rejected
      gate.resolve('abandoned')
    }
    expect(router.state).toMatchObject({ status: 'idle', isLoading: false })
  })
})
