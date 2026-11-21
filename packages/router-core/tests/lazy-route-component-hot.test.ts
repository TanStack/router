/**
 * The route HMR runtime's updates of a lazy route component
 * (`updateLazyRouteComponent`, `takeLazyRouteComponent`), over a wrapper's
 * state as the hot slot every framework's `lazyRouteComponent` builds in
 * development on the client exposes it. That a hot update reaches a real
 * page through a framework's wrapper: router-plugin's
 * `route-hmr-browser*.test.ts`.
 */
import { describe, expect, test, vi } from 'vitest'
import { createControlledPromise } from '../src/utils'
import {
  applyRouteChunkHmr,
  takeLazyRouteComponent,
  updateLazyRouteComponent,
} from '../src/hmr'
import type { LazyRouteComponentHot, RouteHmrAdapter } from '../src/hmr'

type Module = Record<string, unknown>

/** A lazy wrapper's state behind the port its framework builds. */
function wrapper(
  held?: unknown,
  error?: unknown,
  /** `null`: none (the default export) */
  exportName: string | null = 'component',
) {
  const state = {
    importer: (() => Promise.resolve({})) as () => Promise<Module>,
    exportName: (exportName ?? undefined) as string | undefined,
    comp: held,
    error,
    pending: undefined as Promise<unknown> | undefined,
    renders: 0,
  }
  const slot: LazyRouteComponentHot = {
    importer: state.importer,
    exportName: state.exportName,
    retarget: (importer, exportName) => {
      state.importer = importer
      state.exportName = exportName
      return (
        state.comp !== undefined || state.pending !== undefined || !!state.error
      )
    },
    pending: () => state.pending,
    setPending: (promise) => {
      state.pending = promise
    },
    held: () => state.comp,
    settle: (comp, err) => {
      state.comp = comp
      state.error = err
      state.renders++
    },
  }
  const hot = {
    update: (
      importer: () => Promise<Module>,
      exportName: string | undefined,
      adapter: RouteHmrAdapter,
    ) => updateLazyRouteComponent(slot, importer, exportName, adapter),
    take: (module: Module, adapter: RouteHmrAdapter) =>
      takeLazyRouteComponent(slot, module, adapter),
  }
  return { state, hot }
}

/** An adapter that keeps nothing: the loaded export is taken. */
const swap: RouteHmrAdapter = {}
const v = (label: string) => ({ label })

/** `module`, handed over by an evaluation of its split chunk (`applyRouteChunkHmr`). */
function handOver<T extends Module>(module: T): T {
  applyRouteChunkHmr('/handed', 'component', {
    exports: module,
    refresh: false,
    adapter: swap,
  })
  return module
}

describe('lazy route component hot updates', () => {
  test('a wrapper that never loaded only takes the new importer for its first load', () => {
    const { state, hot } = wrapper()
    const next = vi.fn(() => Promise.resolve({ component: v('v2') }))
    hot.update(next, 'component', swap)
    expect(next).not.toHaveBeenCalled()
    expect(state.importer).toBe(next)
    expect(state.renders).toBe(0)
  })

  test('a loaded wrapper re-imports, swaps to the loaded export and re-renders', async () => {
    const { state, hot } = wrapper(v('v1'))
    const next = vi.fn(() => Promise.resolve({ page: v('v2') }))
    hot.update(next, 'page', swap)
    expect(state.importer).toBe(next)
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

  test('recovered: the first import that succeeds after a failed one of a wrapper holding a component calls it, then the wrapper settles as usual', async () => {
    const held = v('v1')
    const { state, hot } = wrapper(held)
    const recovered = vi.fn()
    const adapter: RouteHmrAdapter = { keep: () => true, recovered }
    const ok = () => Promise.resolve({ component: v('v2') })
    hot.update(ok, 'component', adapter)
    await state.pending
    expect(recovered).not.toHaveBeenCalled()
    for (let i = 0; i < 2; i++) {
      hot.update(
        () => Promise.reject(new Error('missing')),
        'component',
        adapter,
      )
      await state.pending
    }
    expect(recovered).not.toHaveBeenCalled()
    hot.update(ok, 'component', adapter)
    await state.pending
    expect(recovered).toHaveBeenCalledOnce()
    expect(state).toMatchObject({ comp: held, error: undefined, renders: 2 })
    hot.update(ok, 'component', adapter)
    await state.pending
    expect(recovered).toHaveBeenCalledOnce()
  })

  test('recovered: not called for a wrapper whose first load failed, or for a failure an adapter without it saw', async () => {
    const recovered = vi.fn()
    const failedFirst = wrapper(undefined, new Error('offline'))
    failedFirst.hot.update(
      () => Promise.reject(new Error('missing')),
      'component',
      { recovered },
    )
    await failedFirst.state.pending
    failedFirst.hot.update(
      () => Promise.resolve({ component: v('v2') }),
      'component',
      { recovered },
    )
    await failedFirst.state.pending
    const { state, hot } = wrapper(v('v1'))
    hot.update(() => Promise.reject(new Error('missing')), 'component', swap)
    await state.pending
    hot.update(() => Promise.resolve({ component: v('v2') }), 'component', {
      recovered,
    })
    await state.pending
    expect(recovered).not.toHaveBeenCalled()
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

  test('take: a module its chunk handed over is kept or taken by keepPatched; the importer stays', async () => {
    const held = v('v1')
    const { state, hot } = wrapper(held)
    const importer = state.importer
    const keepPatched = vi.fn(() => true)
    const keep = vi.fn(() => false)
    const handed = v('v2')
    const module = handOver({ component: handed })
    hot.take(module, { keep, keepPatched })
    expect(await state.pending).toBe(held)
    expect(keepPatched).toHaveBeenCalledWith(handed, held)
    expect(keep).not.toHaveBeenCalled()
    expect(state).toMatchObject({ comp: held, renders: 1, importer })

    hot.take(module, swap)
    expect(await state.pending).toBe(handed)
    expect(state).toMatchObject({ comp: handed, renders: 2, importer })
  })

  test('an import answering a module its chunk handed over is kept or taken by keepPatched, any other by keep', async () => {
    const held = v('v1')
    const { state, hot } = wrapper(held)
    const keepPatched = vi.fn(() => true)
    const keep = vi.fn(() => false)
    const handed = v('v2')
    const module = handOver({ component: handed })
    hot.update(() => Promise.resolve(module), 'component', {
      keep,
      keepPatched,
    })
    expect(await state.pending).toBe(held)
    expect(keepPatched).toHaveBeenCalledWith(handed, held)
    expect(keep).not.toHaveBeenCalled()

    const imported = v('v3')
    hot.update(() => Promise.resolve({ component: imported }), 'component', {
      keep,
      keepPatched,
    })
    expect(await state.pending).toBe(imported)
    expect(keep).toHaveBeenCalledWith(imported, held)
    expect(keepPatched).toHaveBeenCalledOnce()
  })

  test('take: the default export of a wrapper created without an export name, or updated to none', async () => {
    const unnamed = wrapper(v('v1'), undefined, null)
    unnamed.hot.take({ default: v('d'), component: v('c') }, swap)
    expect(await unnamed.state.pending).toEqual(v('d'))

    const named = wrapper(v('v1'))
    named.hot.update(
      () => Promise.resolve({ default: v('d2') }),
      undefined,
      swap,
    )
    await named.state.pending
    named.hot.take({ default: v('d3'), component: v('c3') }, swap)
    expect(await named.state.pending).toEqual(v('d3'))
  })

  test('take: a wrapper that holds nothing, or a module without its export, is left alone', async () => {
    const { state, hot } = wrapper()
    hot.take({ component: v('v2') }, swap)
    expect(state).toMatchObject({ pending: undefined, renders: 0 })

    const loaded = wrapper(v('v1'))
    loaded.hot.take({ pendingComponent: v('v2') }, swap)
    expect(loaded.state).toMatchObject({ pending: undefined, renders: 0 })
    // the export the wrapper reads since a route update
    loaded.hot.update(() => Promise.resolve({ page: v('v2') }), 'page', swap)
    await loaded.state.pending
    loaded.hot.take({ page: v('v3') }, swap)
    expect(await loaded.state.pending).toEqual(v('v3'))
  })
})
