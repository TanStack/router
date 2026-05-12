// @vitest-environment jsdom
/**
 * Regression tests for the three Remix-binding reactivity bugs we fixed
 * over the course of debugging SPA navigation:
 *
 * 1. **Atom subscribe wrap** — `@tanstack/store`'s `atom.subscribe`
 *    returns an Observable-style `{ unsubscribe }` object, not a
 *    teardown function. The binding's `getStoreFactory` must wrap it so
 *    the `RouterReadableStore.subscribe` contract (`(listener) => () =>
 *    void`) holds end-to-end.
 *
 * 2. **`subscribeStore` teardown is callable on abort** — without (1),
 *    `handle.signal.addEventListener('abort', unsubscribe)` registers
 *    the wrong shape and abort never tears the subscription down.
 *
 * 3. **`subscribeDynamicStore` re-binds on store-identity change** —
 *    used by `<Match>` so the subscription follows the active matchId
 *    across navigations instead of staying pinned to the original.
 *
 * 4. **`adaptAtom` returns a fresh wrapper, not the mutated atom** —
 *    earlier implementation overwrote `atom.subscribe` in place. With
 *    `@tanstack/store` builds that share `subscribe` on a prototype,
 *    that leaked across instances. Tests below pin the
 *    no-mutation contract.
 */
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createAtom } from '@tanstack/store'
import { subscribeDynamicStore, subscribeStore } from '../src/subscribe'
import { getStoreFactory } from '../src/routerStores'
import type { Handle } from '@remix-run/ui'

/**
 * Minimal stand-in for a Remix UI `Handle` — gives us a real
 * `AbortController` for the signal and a spy on `update()` so tests
 * can assert how many times a subscription fired before/after an
 * abort.
 */
function makeFakeHandle(): {
  handle: Handle<any, any>
  abort: () => void
  update: ReturnType<typeof vi.fn>
} {
  const ctrl = new AbortController()
  const update = vi.fn()
  const handle = {
    signal: ctrl.signal,
    update,
  } as unknown as Handle<any, any>
  return { handle, abort: () => ctrl.abort(), update }
}

const factory = getStoreFactory({ isServer: false })

afterEach(() => {
  vi.clearAllMocks()
})

describe('atom subscribe wrap (regression: Observable-style { unsubscribe } leaked through)', () => {
  test('subscribe returns a teardown function, not an object', () => {
    const store = factory.createMutableStore(0)
    const teardown = store.subscribe(() => {})
    expect(typeof teardown).toBe('function')
  })

  test('teardown disconnects the listener', async () => {
    const store = factory.createMutableStore(0)
    const listener = vi.fn()
    const teardown = store.subscribe(listener)

    store.set(1)
    await Promise.resolve()
    expect(listener).toHaveBeenCalledTimes(1)

    teardown()
    store.set(2)
    await Promise.resolve()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('adaptAtom — wrapper object pattern (regression: do not mutate underlying atom)', () => {
  test('wrapper exposes get/set/subscribe and is a distinct object from the atom', () => {
    const atom = createAtom(0)
    const store = factory.createMutableStore(0) // wraps a fresh atom

    // The store must be a wrapper, not the same identity as a raw atom.
    expect(typeof store.get).toBe('function')
    expect(typeof store.set).toBe('function')
    expect(typeof store.subscribe).toBe('function')

    // A raw atom's subscribe returns Observable-style { unsubscribe }.
    // The wrapper's subscribe must return a teardown function.
    const sub = atom.subscribe(() => {})
    expect(typeof sub).toBe('object')
    expect(typeof (sub as any).unsubscribe).toBe('function')
    sub.unsubscribe()

    const teardown = store.subscribe(() => {})
    expect(typeof teardown).toBe('function')
    teardown()
  })

  test('two stores have independent subscribe contracts (no prototype sharing)', async () => {
    // Earlier implementation mutated atom.subscribe in place. With
    // some `@tanstack/store` builds, atoms share the subscribe method
    // via prototype — the in-place patch would leak across instances.
    // The wrapper object approach is immune.
    const a = factory.createMutableStore('a-init')
    const b = factory.createMutableStore('b-init')

    const aListener = vi.fn()
    const bListener = vi.fn()

    const aTeardown = a.subscribe(aListener)
    const bTeardown = b.subscribe(bListener)

    a.set('a-next')
    await Promise.resolve()
    expect(aListener).toHaveBeenCalledTimes(1)
    expect(bListener).toHaveBeenCalledTimes(0) // unaffected

    b.set('b-next')
    await Promise.resolve()
    expect(aListener).toHaveBeenCalledTimes(1) // unaffected
    expect(bListener).toHaveBeenCalledTimes(1)

    // Tearing down a's subscription must not affect b.
    aTeardown()
    a.set('a-after')
    b.set('b-after')
    await Promise.resolve()
    expect(aListener).toHaveBeenCalledTimes(1) // still 1
    expect(bListener).toHaveBeenCalledTimes(2)

    bTeardown()
  })

  test('readonly store wrapper exposes get + subscribe (no set)', () => {
    const store = factory.createReadonlyStore(() => 99)
    expect(typeof store.get).toBe('function')
    expect(typeof store.subscribe).toBe('function')
    expect(store.get()).toBe(99)
    // No set on a readonly store — TS prevents this and runtime
    // doesn't expose it.
    expect((store as any).set).toBeUndefined()
  })
})

describe('subscribeStore — abort teardown', () => {
  test('aborting handle.signal disconnects the store subscription', async () => {
    const { handle, abort, update } = makeFakeHandle()
    const store = factory.createMutableStore(0)

    subscribeStore(handle, store)

    store.set(1)
    await Promise.resolve()
    expect(update).toHaveBeenCalledTimes(1)

    abort()
    store.set(2)
    await Promise.resolve()
    expect(update).toHaveBeenCalledTimes(1)
  })

  test('returns a getter that reads the latest store value', () => {
    const { handle } = makeFakeHandle()
    const store = factory.createMutableStore(7)
    const read = subscribeStore(handle, store)
    expect(read()).toBe(7)
    store.set(42)
    expect(read()).toBe(42)
  })
})

describe('subscribeDynamicStore — re-binds when store identity changes', () => {
  test('listener follows the current store, not the one from the first render', async () => {
    const { handle, update } = makeFakeHandle()
    const storeA = factory.createMutableStore('A0')
    const storeB = factory.createMutableStore('B0')

    let active = storeA
    const read = subscribeDynamicStore(handle, () => active)

    // First read binds to A.
    expect(read()).toBe('A0')

    storeA.set('A1')
    await Promise.resolve()
    expect(update).toHaveBeenCalledTimes(1)

    // Simulate a render where props changed — getStore now returns B.
    active = storeB
    expect(read()).toBe('B0')

    storeB.set('B1')
    await Promise.resolve()
    expect(update).toHaveBeenCalledTimes(2)

    // The old subscription on A must be torn down — mutating A should
    // NOT trigger another update.
    storeA.set('A2')
    await Promise.resolve()
    expect(update).toHaveBeenCalledTimes(2)
  })

  test('returns undefined when getStore returns undefined', () => {
    const { handle } = makeFakeHandle()
    const read = subscribeDynamicStore<unknown>(handle, () => undefined)
    expect(read()).toBeUndefined()
  })

  test('aborting handle.signal disconnects the current subscription', async () => {
    const { handle, abort, update } = makeFakeHandle()
    const store = factory.createMutableStore(0)
    const read = subscribeDynamicStore(handle, () => store)

    read() // bind
    store.set(1)
    await Promise.resolve()
    expect(update).toHaveBeenCalledTimes(1)

    abort()
    store.set(2)
    await Promise.resolve()
    expect(update).toHaveBeenCalledTimes(1)
  })

  test('switching stores between binds does not double-fire', async () => {
    const { handle, update } = makeFakeHandle()
    const storeA = factory.createMutableStore(0)
    const storeB = factory.createMutableStore(0)

    let active = storeA
    const read = subscribeDynamicStore(handle, () => active)
    read() // bind A

    active = storeB
    read() // re-bind to B

    storeB.set(1)
    await Promise.resolve()
    expect(update).toHaveBeenCalledTimes(1)

    // Setting A again should NOT trigger update (we unsubscribed).
    storeA.set(99)
    await Promise.resolve()
    expect(update).toHaveBeenCalledTimes(1)
  })
})
