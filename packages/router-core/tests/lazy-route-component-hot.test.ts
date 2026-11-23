/**
 * The route HMR runtime's updates of a lazy route component: a route
 * module's evaluation points the route's live wrapper at the new
 * evaluation's importer, and the wrapper imports again. Over a wrapper's
 * state as the hot slot every framework's `lazyRouteComponent` builds in
 * development on the client exposes it, through the runtime's entry points
 * (`applyRouteHmr`, `applyRouteChunkHmr`). That a hot update reaches a real
 * page through a framework's wrapper: router-plugin's
 * `route-hmr-browser*.test.ts`.
 */
import { describe, expect, test, vi } from 'vitest'
import { createControlledPromise } from '../src/utils'
import { applyRouteChunkHmr, applyRouteHmr } from '../src/hmr'
import { fakeRouter, fakeWrapper } from './route-hmr-fakes'
import type { RouteHmrAdapter } from '../src/hmr'

type Module = Record<string, unknown>

let files = 0

/**
 * A route whose `component` is a lazy wrapper, held by a router, and its
 * route file: `update` is one more evaluation of the route module, whose
 * wrapper has `importer` and `exportName`.
 */
function wrapper(
  held?: unknown,
  error?: unknown,
  exportName: string | null = 'component',
) {
  const file = `/src/routes/hot${files++}.tsx`
  const id = `/hot${files}`
  const { state, wrapper: live } = fakeWrapper(held, error, exportName)
  const route = { options: { component: live } as Record<string, any> }
  const router = fakeRouter(() => ({ [id]: route }))
  applyRouteHmr(id, route as any, { file }, {})
  const update = (
    importer: () => Promise<Module>,
    name: string | undefined,
    adapter: RouteHmrAdapter,
  ) =>
    applyRouteHmr(
      id,
      {
        options: {
          component: { __tsrHot: { importer, exportName: name } },
        },
      } as any,
      { file },
      adapter,
    )
  /** The route file's split chunk evaluated (webpack-style hosts). */
  const chunk = (adapter: RouteHmrAdapter, refresh?: boolean) =>
    applyRouteChunkHmr(file, 'component', adapter, refresh)
  return { state, live, router, hot: { update, chunk } }
}

/** An adapter that keeps nothing: the loaded export is taken. */
const swap: RouteHmrAdapter = {}
const v = (label: string) => ({ label })

describe('lazy route component hot updates', () => {
  test('a wrapper that never loaded only takes the new importer for its first load', async () => {
    const { state, hot } = wrapper()
    const next = vi.fn(() => Promise.resolve({ component: v('v2') }))
    hot.update(next, 'component', swap)
    expect(next).not.toHaveBeenCalled()
    expect(state.renders).toBe(0)
    await state.importer()
    expect(next).toHaveBeenCalledOnce()
  })

  test('a loaded wrapper re-imports, swaps to the loaded export and re-renders', async () => {
    const { state, hot } = wrapper(v('v1'))
    const next = vi.fn(() => Promise.resolve({ page: v('v2') }))
    hot.update(next, 'page', swap)
    expect(state.exportName).toBe('page')
    expect(await state.pending).toEqual(v('v2'))
    expect(state).toMatchObject({ comp: v('v2'), renders: 1 })
    expect(state.pending).toBeUndefined()
    expect(next).toHaveBeenCalledOnce()
  })

  test('keep holds the component (its refresh runtime patches it)', async () => {
    const held = v('v1')
    const { state, hot } = wrapper(held)
    const keep = vi.fn(() => true)
    const loaded = v('v2')
    hot.update(() => Promise.resolve({ component: loaded }), 'component', {
      keep,
    })
    // what a load in flight resolves to: the held component
    expect(await state.pending).toBe(held)
    expect(keep).toHaveBeenCalledWith(loaded, held)
    expect(state.comp).toBe(held)
    expect(state.pending).toBeUndefined()
  })

  test('a kept import after a failed one keeps the component and re-renders', async () => {
    const held = v('v1')
    const { state, hot } = wrapper(held)
    hot.update(() => Promise.reject(new Error('boom')), 'component', swap)
    await state.pending
    hot.update(() => Promise.resolve({ component: v('v2') }), 'component', {
      keep: () => true,
    })
    await state.pending
    expect(state).toMatchObject({ comp: held, error: undefined, renders: 1 })
  })

  test('a load in flight is replaced by the hot import, which settles it', async () => {
    const first = createControlledPromise<unknown>()
    const { state, hot } = wrapper()
    state.pending = first
    hot.update(() => Promise.resolve({ component: v('v2') }), 'component', swap)
    expect(state.pending).not.toBe(first)
    await state.pending
    expect(state).toMatchObject({ comp: v('v2'), renders: 1 })
  })

  test('only the newest import decides what the wrapper holds, whichever settles first', async () => {
    for (const order of [
      ['third', 'second'],
      ['second', 'third'],
    ] as const) {
      const { state, hot } = wrapper(v('v1'))
      const imports = {
        second: createControlledPromise<Module>(),
        third: createControlledPromise<Module>(),
      }
      hot.update(() => imports.second, 'component', swap)
      const stale = state.pending
      hot.update(() => imports.third, 'component', swap)
      const newest = state.pending
      for (const name of order) {
        imports[name].resolve({ component: v(name) })
      }
      // an older import completing while the newest is pending settles with it
      expect(await stale).toEqual(
        order[0] === 'second' ? v('third') : undefined,
      )
      await newest
      expect(state).toMatchObject({ comp: v('third'), renders: 1 })
      expect(state.pending).toBeUndefined()
    }
  })

  test('a failed import leaves a wrapper holding a component as it is; the next import swaps', async () => {
    const held = v('v1')
    const { state, hot } = wrapper(held)
    const failure = new Error('syntax error')
    hot.update(() => Promise.reject(failure), 'component', swap)
    expect(await state.pending).toBeUndefined()
    expect(state).toMatchObject({
      comp: held,
      error: undefined,
      renders: 0,
      pending: undefined,
    })

    hot.update(() => Promise.resolve({ component: v('v2') }), 'component', swap)
    await state.pending
    expect(state).toMatchObject({ comp: v('v2'), error: undefined })
  })

  // (that the page reloads then: start-plugin-core
  // `start-dev-removed-import.test.ts`, a real page)
  test('reloadOnRecover: the first import that succeeds after a failed one of a wrapper holding a component settles nothing (the page reloads)', async () => {
    // jsdom reports the navigation it does not implement
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const held = v('v1')
    const { state, hot } = wrapper(held)
    const adapter: RouteHmrAdapter = { reloadOnRecover: true }
    const ok = () => Promise.resolve({ component: v('v2') })
    hot.update(ok, 'component', adapter)
    await state.pending
    expect(state).toMatchObject({ comp: v('v2'), renders: 1 })
    hot.update(() => Promise.reject(new Error('missing')), 'component', adapter)
    await state.pending
    hot.update(
      () => Promise.resolve({ component: v('v3') }),
      'component',
      adapter,
    )
    await state.pending
    expect(state).toMatchObject({ comp: v('v2'), renders: 1 })
    vi.restoreAllMocks()
  })

  test('a recovered import of an adapter without reloadOnRecover, or of a wrapper whose first load failed, is taken', async () => {
    const failedFirst = wrapper(undefined, new Error('offline'))
    failedFirst.hot.update(
      () => Promise.reject(new Error('missing')),
      'component',
      { reloadOnRecover: true },
    )
    await failedFirst.state.pending
    failedFirst.hot.update(
      () => Promise.resolve({ component: v('v2') }),
      'component',
      { reloadOnRecover: true },
    )
    await failedFirst.state.pending
    expect(failedFirst.state.comp).toEqual(v('v2'))

    const { state, hot } = wrapper(v('v1'))
    hot.update(() => Promise.reject(new Error('missing')), 'component', swap)
    await state.pending
    hot.update(() => Promise.resolve({ component: v('v2') }), 'component', swap)
    await state.pending
    expect(state.comp).toEqual(v('v2'))
  })

  test('a failed wrapper re-imports (it counts as loaded)', async () => {
    const { state, hot } = wrapper(undefined, new Error('offline'))
    hot.update(() => Promise.resolve({ component: v('v2') }), 'component', swap)
    await state.pending
    expect(state).toMatchObject({ comp: v('v2'), error: undefined })
  })

  test('a failed wrapper whose re-import fails holds the new failure', async () => {
    const { state, hot } = wrapper(undefined, new Error('offline'))
    const failure = new Error('syntax error')
    hot.update(() => Promise.reject(failure), 'component', swap)
    await state.pending
    expect(state).toMatchObject({ comp: undefined, error: failure, renders: 1 })
  })

  test('a failure of the newest import wins over a stale success, whichever settles first: the held component stays', async () => {
    for (const staleFirst of [true, false]) {
      const held = v('v1')
      const { state, hot } = wrapper(held)
      const second = createControlledPromise<Module>()
      const third = createControlledPromise<Module>()
      hot.update(() => second, 'component', swap)
      const stale = state.pending
      hot.update(() => third, 'component', swap)
      const newest = state.pending
      const failure = new Error('syntax error')
      if (staleFirst) {
        second.resolve({ component: v('v2') })
        third.reject(failure)
      } else {
        third.reject(failure)
        second.resolve({ component: v('v2') })
      }
      await newest
      await stale
      expect(state).toMatchObject({ comp: held, error: undefined, renders: 0 })
    }
  })

  test('the default export, when no export is named', async () => {
    const { state, hot } = wrapper(v('v1'))
    hot.update(
      () => Promise.resolve({ default: v('d'), component: v('c') }),
      undefined,
      swap,
    )
    expect(state.exportName).toBeUndefined()
    await state.pending
    expect(state.comp).toEqual(v('d'))
  })

  test('nothing held: the loaded export is taken without asking keep', async () => {
    const { state, hot } = wrapper(undefined, new Error('offline'))
    const keep = vi.fn(() => true)
    hot.update(() => Promise.resolve({ component: v('v2') }), 'component', {
      keep,
    })
    await state.pending
    expect(keep).not.toHaveBeenCalled()
    expect(state).toMatchObject({ comp: v('v2'), renders: 1 })
  })

  test('settled: the loaded export is taken once the refresh settled, in its wait the held one renders', async () => {
    const held = v('v1')
    const { state, hot } = wrapper(held)
    const waiting: Array<() => void> = []
    const loaded = v('v2')
    hot.update(() => Promise.resolve({ component: loaded }), 'component', {
      settled: (apply) => waiting.push(apply),
    })
    const pending = state.pending
    await vi.waitFor(() => expect(waiting).toHaveLength(1))
    expect(state).toMatchObject({ comp: held, renders: 0, pending })
    waiting[0]!()
    expect(await pending).toBe(loaded)
    expect(state).toMatchObject({ comp: loaded, renders: 1 })
    expect(state.pending).toBeUndefined()
  })

  test('settled: a newer import during the wait decides what the wrapper holds', async () => {
    const { state, hot } = wrapper(v('v1'))
    const waiting: Array<() => void> = []
    const adapter: RouteHmrAdapter = {
      settled: (apply) => waiting.push(apply),
    }
    hot.update(
      () => Promise.resolve({ component: v('v2') }),
      'component',
      adapter,
    )
    const stale = state.pending
    await vi.waitFor(() => expect(waiting).toHaveLength(1))
    hot.update(
      () => Promise.resolve({ component: v('v3') }),
      'component',
      adapter,
    )
    const newest = state.pending
    await vi.waitFor(() => expect(waiting).toHaveLength(2))
    waiting[0]!()
    // the older import settles with the newer one, still waiting
    waiting[1]!()
    expect(await stale).toEqual(v('v3'))
    expect(await newest).toEqual(v('v3'))
    expect(state).toMatchObject({ comp: v('v3'), renders: 1 })
  })

  test('settled: an import of the held component itself takes it at once', async () => {
    const held = v('v1')
    const { state, hot } = wrapper(held)
    const settled = vi.fn()
    hot.update(() => Promise.resolve({ component: held }), 'component', {
      settled,
    })
    expect(await state.pending).toBe(held)
    expect(settled).not.toHaveBeenCalled()
    expect(state.renders).toBe(1)
  })

  test('a stale failure leaves the newest import alone', async () => {
    const { state, hot } = wrapper(v('v1'))
    const second = createControlledPromise<Module>()
    hot.update(() => second, 'component', swap)
    const stale = state.pending
    hot.update(() => Promise.resolve({ component: v('v3') }), 'component', swap)
    await state.pending
    second.reject(new Error('stale'))
    await stale
    expect(state).toMatchObject({ comp: v('v3'), error: undefined, renders: 1 })
  })

  test('without a refresh to wait for, the route load waits for the hot import through the wrapper (preload), until it settled', async () => {
    const { state, live, hot } = wrapper(v('v1'))
    const next = createControlledPromise<Module>()
    hot.update(() => next, 'component', swap)
    const preload: Promise<unknown> = live.preload()
    expect(preload).toBe(state.pending)
    next.resolve({ component: v('v2') })
    expect(await preload).toEqual(v('v2'))
    expect(live.preload).toBeUndefined()

    // a framework whose refresh settles later: the load does not wait for it
    const refreshed = wrapper(v('v1'))
    refreshed.hot.update(
      () => Promise.resolve({ component: v('v2') }),
      'component',
      { settled: () => {} },
    )
    expect(refreshed.live.preload).toBeUndefined()
  })

  test('new code in a wrapper publishes the matches of the router that holds the route again', async () => {
    const { state, router, hot } = wrapper(v('v1'))
    hot.update(() => Promise.resolve({ component: v('v2') }), 'component', swap)
    await state.pending
    expect(router.stores.setMatches).toHaveBeenCalledOnce()
    // kept, and patched by the framework: new code too
    hot.update(() => Promise.resolve({ component: v('v3') }), 'component', {
      keep: () => true,
    })
    await state.pending
    expect(router.stores.setMatches).toHaveBeenCalledTimes(2)
    // the component it holds: nothing new
    hot.update(
      () => Promise.resolve({ component: state.comp }),
      'component',
      swap,
    )
    await state.pending
    expect(router.stores.setMatches).toHaveBeenCalledTimes(2)
  })

  test('a chunk that evaluated on its own: the wrapper imports again through the importer it reads now, and the route loads only for a non-component option', async () => {
    const { state, router, hot } = wrapper(v('v1'))
    let exported = v('v2')
    const importer = vi.fn(() => Promise.resolve({ page: exported }))
    hot.update(importer, 'page', swap)
    await state.pending
    expect(state.comp).toEqual(v('v2'))
    router._refreshRoute.mockClear()

    // its first evaluation since the route module's is that evaluation's own
    hot.chunk(swap, false)
    expect(state.pending).toBeUndefined()
    exported = v('v3')
    hot.chunk(swap, false)
    expect(await state.pending).toEqual(v('v3'))
    expect(importer).toHaveBeenCalledTimes(2)
    expect(router._refreshRoute).not.toHaveBeenCalled()

    exported = v('v4')
    hot.chunk(swap, true)
    expect(await state.pending).toEqual(v('v4'))
    expect(router._refreshRoute).toHaveBeenCalledOnce()
  })

  test('a chunk that evaluated on its own leaves a wrapper that holds nothing alone', () => {
    const { state, hot } = wrapper()
    hot.chunk(swap, false)
    hot.chunk(swap, false)
    expect(state).toMatchObject({ pending: undefined, renders: 0 })
  })
})
