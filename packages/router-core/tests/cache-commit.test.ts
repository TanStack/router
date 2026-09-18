import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import {
  BaseRootRoute,
  BaseRoute,
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
} from '../src'
import { commitMatches } from '../src/load-client'
import { createTestRouter } from './routerTestUtils'
import type { AnyRouteMatch, AnyRouter } from '../src'
import type { LoadTransaction, LoaderFlight } from '../src/load-client'

type Match = AnyRouteMatch & { _flight?: LoaderFlight }

function resource(leases = 1): LoaderFlight {
  return [Promise.resolve([0, undefined]), new AbortController(), leases]
}

function match(id: string, flight?: LoaderFlight): Match {
  return {
    id,
    routeId: '/items/$id',
    status: 'success',
    updatedAt: 0,
    _flight: flight,
  } as Match
}

function setup(
  previous: Array<Match>,
  cached: Array<Match>,
  next = [match('next')],
) {
  const tx = [
    new AbortController(),
    0,
    undefined,
    next,
    0,
    Promise.resolve(),
  ] as unknown as LoadTransaction
  const publish = vi.fn()
  const router = {
    _tx: tx,
    _committed: previous,
    _cache: new Map(cached.map((entry) => [entry.id, entry])),
    _flights: new Map(
      [...previous, ...cached, ...next]
        .filter((entry) => entry._flight)
        .map((entry) => [entry.id, entry._flight!]),
    ),
    options: {},
    routesById: {
      '/items/$id': {
        options: {
          loader: () => {},
          gcTime: Infinity,
          preloadGcTime: Infinity,
        },
      },
    },
    stores: { setMatches: publish },
  } as unknown as AnyRouter
  return {
    router,
    publish,
    tx,
    next,
    commit: () => commitMatches(router, tx, next),
  }
}

describe('commit cache ownership', () => {
  test.each(['error', 'notFound', 'pending', 'global not found'] as const)(
    'only supersedes the rendered prefix and settled descendants at a %s boundary',
    (boundaryKind) => {
      const cached = [
        'prefix',
        'boundary',
        'settled',
        'pending',
        'failed',
        'unrelated',
      ].map((id) => match(id, resource()))
      const next = cached.slice(0, -1).map((entry) => match(entry.id))
      if (boundaryKind === 'global not found') {
        next[1]!._notFound = true
      } else {
        next[1]!.status = boundaryKind
      }
      next[3]!.status = 'pending'
      next[4]!.status = 'error'
      const { router, commit } = setup([], cached, next)

      commit()

      expect([...router._cache.keys()]).toEqual([
        'pending',
        'failed',
        'unrelated',
      ])
      for (const [index, entry] of cached.entries()) {
        if (index < 3) {
          expect(entry._flight).toBeUndefined()
        } else {
          expect(router._cache.get(entry.id)).toBe(entry)
          expect(entry._flight?.[1].signal.aborted).toBe(false)
        }
      }
    },
  )

  test('retains cached identities and releases the committed owner cloned into cache', () => {
    const retainedFlight = resource()
    const departedFlight = resource()
    const retained = match('retained', retainedFlight)
    const departed = match('departed', departedFlight)
    const { router, commit } = setup([departed], [retained])

    commit()

    expect(router._cache.get('retained')).toBe(retained)
    expect(retained._flight).toBe(retainedFlight)
    expect(retainedFlight[2]).toBe(1)
    expect(retainedFlight[1].signal.aborted).toBe(false)
    expect(router._cache.get('departed')).not.toBe(departed)
    expect((router._cache.get('departed') as Match)._flight).toBeUndefined()
    expect(departed._flight).toBeUndefined()
    expect(departedFlight[1].signal.aborted).toBe(true)
  })

  test('keeps a retained generation alive when a departing generation shares its flight', () => {
    const shared = resource(2)
    const departed = match('same', shared)
    const retained = match('same', shared)
    const { router, commit } = setup([departed], [retained])

    commit()

    expect(router._cache.get('same')).toBe(retained)
    expect(departed._flight).toBeUndefined()
    expect(retained._flight).toBe(shared)
    expect(shared[2]).toBe(1)
    expect(shared[1].signal.aborted).toBe(false)
  })

  test('releases the old same-id generation without releasing its replacement', () => {
    const oldFlight = resource()
    const newFlight = resource()
    const old = match('same', oldFlight)
    const replacement = match('same', newFlight)
    const { router, commit } = setup([], [old], [replacement])

    commit()

    expect(router._cache.has('same')).toBe(false)
    expect(old._flight).toBeUndefined()
    expect(oldFlight[1].signal.aborted).toBe(true)
    expect(replacement._flight).toBe(newFlight)
    expect(newFlight[1].signal.aborted).toBe(false)
    expect(router._flights?.get('same')).toBe(newFlight)
  })

  test('detaches all expired owners before abort listeners run, including duplicate objects', () => {
    const shared = resource(2)
    const first = match('first', shared)
    const second = match('second', shared)
    first.status = second.status = 'error'
    const { router, tx, next, commit } = setup([first], [first, second])
    const onAbort = vi.fn(() => {
      expect(first._flight).toBeUndefined()
      expect(second._flight).toBeUndefined()
      expect(router._cache.size).toBe(0)
      expect(router._committed).toBe(next)
      expect(tx[3]).toEqual([])
    })
    shared[1].signal.addEventListener('abort', onAbort)

    commit()

    expect(shared[2]).toBe(0)
    expect(onAbort).toHaveBeenCalledOnce()
  })

  test('a synchronous publication observer can clear retained preloads', async () => {
    let signal: AbortSignal | undefined
    let observe: (() => void) | undefined
    const root = new BaseRootRoute({})
    const home = new BaseRoute({ getParentRoute: () => root, path: '/' })
    const other = new BaseRoute({ getParentRoute: () => root, path: '/other' })
    const retained = new BaseRoute({
      getParentRoute: () => root,
      path: '/retained',
      preloadGcTime: Infinity,
      loader: ({ abortController }) => {
        signal = abortController.signal
        return 'retained data'
      },
    })
    // Framework adapters supply this public batching hook. Observe a complete
    // store publication synchronously, before commit's resource handoff.
    const router = new RouterCore(
      {
        routeTree: root.addChildren([home, other, retained]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
        isServer: false,
      },
      () => ({
        createMutableStore: createNonReactiveMutableStore,
        createReadonlyStore: createNonReactiveReadonlyStore,
        batch: (fn) => {
          fn()
          observe?.()
        },
      }),
    )
    await router.load()
    await router.preloadRoute({ to: '/retained' })
    const abort = vi.fn(() => {
      expect(router.state.matches.at(-1)?.routeId).toBe(other.id)
    })
    signal!.addEventListener('abort', abort)
    observe = () => {
      if (router.state.matches.at(-1)?.routeId === other.id) {
        observe = undefined
        router.clearCache()
      }
    }

    await router.navigate({ to: '/other' })

    expect(signal!.aborted).toBe(true)
    expect(abort).toHaveBeenCalledOnce()
  })

  test('uses the captured cache if publication replaces the router cache', () => {
    const retainedFlight = resource()
    const retained = match('retained', retainedFlight)
    const { router, publish, commit } = setup([], [retained])
    publish.mockImplementation(() => {
      router._cache = new Map()
    })

    commit()

    expect(router._cache.size).toBe(0)
    expect(retained._flight).toBe(retainedFlight)
    expect(retainedFlight[1].signal.aborted).toBe(false)
  })
})

test('an unrelated navigation retains a fresh preload flight and evicts an expired one', async () => {
  let freshSignal: AbortSignal | undefined
  let expiredSignal: AbortSignal | undefined
  const root = new BaseRootRoute({})
  const home = new BaseRoute({ getParentRoute: () => root, path: '/' })
  const other = new BaseRoute({ getParentRoute: () => root, path: '/other' })
  const freshLoader = vi.fn(
    ({ abortController }: { abortController: AbortController }) => {
      freshSignal = abortController.signal
      return 'fresh data'
    },
  )
  const fresh = new BaseRoute({
    getParentRoute: () => root,
    path: '/fresh',
    loader: freshLoader,
    staleTime: Infinity,
    preloadStaleTime: Infinity,
    preloadGcTime: Infinity,
  })
  const expired = new BaseRoute({
    getParentRoute: () => root,
    path: '/expired',
    loader: ({ abortController }) => {
      expiredSignal = abortController.signal
      return 'expired data'
    },
    preloadGcTime: 0,
  })
  const router = createTestRouter({
    routeTree: root.addChildren([home, other, fresh, expired]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  await router.preloadRoute({ to: '/fresh' })
  await router.preloadRoute({ to: '/expired' })
  expect(freshSignal?.aborted).toBe(false)
  expect(expiredSignal?.aborted).toBe(false)

  await router.navigate({ to: '/other' })

  expect(freshSignal?.aborted).toBe(false)
  expect(expiredSignal?.aborted).toBe(true)
  await router.navigate({ to: '/fresh' })
  expect(freshLoader).toHaveBeenCalledOnce()
  expect(router.state.matches.at(-1)?.loaderData).toBe('fresh data')
})

test.each([false, true])(
  'cache retirement reentry preserves successor ownership (retained=%s)',
  async (keepUnrelated) => {
    const root = new BaseRootRoute({})
    const home = new BaseRoute({ getParentRoute: () => root, path: '/' })
    const enteredOther = vi.fn()
    const other = new BaseRoute({
      getParentRoute: () => root,
      path: '/other',
      onEnter: enteredOther,
    })
    let firstSignal: AbortSignal | undefined
    const secondSignals: Array<AbortSignal> = []
    let retainedSignal: AbortSignal | undefined
    const first = new BaseRoute({
      getParentRoute: () => root,
      path: '/first',
      preloadGcTime: 0,
      loader: ({ abortController }) => {
        firstSignal = abortController.signal
        return 'first'
      },
    })
    const secondLoader = vi.fn(
      ({ abortController }: { abortController: AbortController }) => {
        secondSignals.push(abortController.signal)
        return `second ${secondSignals.length}`
      },
    )
    const second = new BaseRoute({
      getParentRoute: () => root,
      path: '/second',
      preloadGcTime: 0,
      preloadStaleTime: Infinity,
      loader: secondLoader,
    })
    const retainedLoader = vi.fn(
      ({ abortController }: { abortController: AbortController }) => {
        retainedSignal = abortController.signal
        return 'retained'
      },
    )
    const retained = new BaseRoute({
      getParentRoute: () => root,
      path: '/retained',
      preloadGcTime: Infinity,
      preloadStaleTime: Infinity,
      loader: retainedLoader,
    })
    const router = createTestRouter({
      routeTree: root.addChildren([home, other, first, second, retained]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await router.load()
    await router.preloadRoute({ to: '/first' })
    await router.preloadRoute({ to: '/second' })
    if (keepUnrelated) {
      await router.preloadRoute({ to: '/retained' })
    }
    let successor: Promise<void> | undefined
    const firstAbort = vi.fn(() => {
      expect(router.state.matches.at(-1)?.routeId).toBe(other.id)
      successor = router.navigate({ to: '/second' })
    })
    const secondAbort = vi.fn()
    firstSignal!.addEventListener('abort', firstAbort)
    secondSignals[0]!.addEventListener('abort', secondAbort)
    await router.navigate({ to: '/other' })
    await successor
    expect(firstAbort).toHaveBeenCalledOnce()
    expect(secondAbort).toHaveBeenCalledOnce()
    expect(secondLoader).toHaveBeenCalledTimes(2)
    expect(secondSignals[1]!.aborted).toBe(false)
    expect(router.state.matches.at(-1)?.loaderData).toBe('second 2')
    expect(enteredOther).not.toHaveBeenCalled()
    if (keepUnrelated) {
      expect(retainedSignal?.aborted).toBe(false)
      await router.navigate({ to: '/retained' })
      expect(retainedLoader).toHaveBeenCalledOnce()
    }
  },
)
