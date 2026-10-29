/**
 * The hot slot every framework's `lazyRouteComponent` builds in development
 * on the client (`lazyRouteComponentHot`), over a wrapper's state as the
 * framework's dev block exposes it (its port). That a hot update reaches a
 * real page through a framework's wrapper: router-plugin's
 * `route-hmr-browser*.test.ts`.
 */
import { describe, expect, test, vi } from 'vitest'
import { createControlledPromise } from '../src/utils'
import { lazyRouteComponentHot } from '../src/hmr'

type Module = Record<string, unknown>

/** A lazy wrapper's state behind the port its framework builds. */
function wrapper(held?: unknown, error?: unknown) {
  const state = {
    importer: (() => Promise.resolve({})) as () => Promise<Module>,
    exportName: 'component' as string | undefined,
    comp: held,
    error,
    pending: undefined as Promise<unknown> | undefined,
    renders: 0,
  }
  const hot = lazyRouteComponentHot(
    state.importer,
    state.exportName,
    {
      retarget: (importer, exportName) => {
        state.importer = importer
        state.exportName = exportName
        return (
          state.comp !== undefined ||
          state.pending !== undefined ||
          !!state.error
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
    },
    {},
  )
  return { state, hot }
}

const swap = () => false
const v = (label: string) => ({ label })

describe('lazyRouteComponentHot', () => {
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

  test('keep holds the component (its refresh runtime patches it) and does not re-render', async () => {
    const held = v('v1')
    const { state, hot } = wrapper(held)
    const keep = vi.fn(() => true)
    const loaded = v('v2')
    hot.update(() => Promise.resolve({ component: loaded }), 'component', keep)
    // what a load in flight resolves to: the held component
    expect(await state.pending).toBe(held)
    expect(keep).toHaveBeenCalledWith(loaded, held)
    expect(state.comp).toBe(held)
    expect(state.renders).toBe(0)
    expect(state.pending).toBeUndefined()
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

  test('a failed import holds its error, keeps the component, and re-renders; the next import clears it', async () => {
    const held = v('v1')
    const { state, hot } = wrapper(held)
    const failure = new Error('syntax error')
    hot.update(() => Promise.reject(failure), 'component', swap)
    expect(await state.pending).toBeUndefined()
    expect(state).toMatchObject({
      comp: held,
      error: failure,
      renders: 1,
      pending: undefined,
    })

    hot.update(() => Promise.resolve({ component: v('v2') }), 'component', swap)
    await state.pending
    expect(state).toMatchObject({ comp: v('v2'), error: undefined })
  })

  test('a failed wrapper re-imports (it counts as loaded)', async () => {
    const { state, hot } = wrapper(undefined, new Error('offline'))
    hot.update(() => Promise.resolve({ component: v('v2') }), 'component', swap)
    await state.pending
    expect(state).toMatchObject({ comp: v('v2'), error: undefined })
  })

  test('a failure of the newest import wins over a stale success, whichever settles first', async () => {
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
      expect(state).toMatchObject({ comp: held, error: failure, renders: 1 })
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

  test('the slot keeps the importer and export name it was created with', async () => {
    // (the route HMR runtime falls back to the first importer in Vite's bundled dev)
    const { state, hot } = wrapper(v('v1'))
    const first = state.importer
    hot.update(() => Promise.resolve({ page: v('v2') }), 'page', swap)
    await state.pending
    expect(hot.importer).toBe(first)
    expect(hot.exportName).toBe('component')
  })

  test('nothing held: the loaded export is taken without asking keep', async () => {
    const { state, hot } = wrapper(undefined, new Error('offline'))
    const keep = vi.fn(() => true)
    hot.update(() => Promise.resolve({ component: v('v2') }), 'component', keep)
    await state.pending
    expect(keep).not.toHaveBeenCalled()
    expect(state).toMatchObject({ comp: v('v2'), renders: 1 })
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
})
