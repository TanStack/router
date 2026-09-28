import React from 'react'
import { act, cleanup, render } from '@testing-library/react'
import {
  batch,
  createAsyncAtom,
  createAtom,
  useSelector,
} from '@tanstack/react-store'
import { afterEach, expect, test, vi } from 'vitest'

afterEach(cleanup)

test('unobserved reads keep snapshot identity and observe writes before subscribing', () => {
  const source = createAtom(0)
  const derived = createAtom(() => ({ value: source.get() }))
  const first = derived.get()
  expect(derived.get()).toBe(first)
  source.set(1)
  expect(derived.get().value).toBe(1)
  const listener = vi.fn()
  const subscription = derived.subscribe(listener)
  source.set(2)
  expect(listener).toHaveBeenLastCalledWith({ value: 2 })
  subscription.unsubscribe()
  source.set(3)
  expect(derived.get().value).toBe(3)
  expect(derived.get()).toBe(derived.get())
  const second = derived.subscribe(listener)
  source.set(4)
  expect(listener).toHaveBeenLastCalledWith({ value: 4 })
  second.unsubscribe()
})

test('nested conditional dependencies remain correct through batches and resubscription', () => {
  const left = createAtom(1)
  const right = createAtom(10)
  const chooseLeft = createAtom(true)
  const inner = createAtom(() => (chooseLeft.get() ? left.get() : right.get()))
  const outer = createAtom(() => inner.get() * 2)
  expect(outer.get()).toBe(2)
  const listener = vi.fn()
  const subscription = outer.subscribe(listener)
  batch(() => {
    chooseLeft.set(false)
    right.set(20)
    left.set(5)
  })
  expect(listener).toHaveBeenCalledTimes(1)
  expect(listener).toHaveBeenLastCalledWith(40)
  subscription.unsubscribe()
  right.set(30)
  expect(outer.get()).toBe(60)
  chooseLeft.set(true)
  expect(outer.get()).toBe(10)
})

test('failed unobserved computations retry instead of caching an old snapshot', () => {
  const source = createAtom(0)
  const derived = createAtom(() => {
    if (source.get() === 0) {
      throw new Error('pending')
    }
    return source.get()
  })
  expect(() => derived.get()).toThrow('pending')
  expect(() => derived.get()).toThrow('pending')
  source.set(1)
  expect(derived.get()).toBe(1)
})

test('unobserved async atoms preserve settled results across unrelated writes', async () => {
  const load = vi.fn(async () => 42)
  const derived = createAsyncAtom(load)
  expect(derived.get().status).toBe('pending')
  await Promise.resolve()
  expect(derived.get()).toEqual({ status: 'done', data: 42 })
  createAtom(0).set(1)
  expect(derived.get()).toEqual({ status: 'done', data: 42 })
  expect(load).toHaveBeenCalledTimes(1)
})

test.skipIf(!global.gc)(
  'discarded Suspense renders release their computed atoms',
  async () => {
    const source = createAtom(0)
    const refs: Array<WeakRef<object>> = []
    const pending = new Promise<never>(() => {})
    function Suspended(): never {
      const derived = React.useMemo(() => {
        const atom = createAtom(() => ({ value: source.get() }))
        refs.push(new WeakRef(atom))
        return atom
      }, [])
      useSelector(derived)
      throw pending
    }
    for (let index = 0; index < 20; index++) {
      const view = render(
        <React.Suspense fallback="waiting">
          <Suspended />
        </React.Suspense>,
      )
      expect(view.getByText('waiting')).toBeTruthy()
      view.unmount()
    }
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      global.gc!()
    }
    expect(refs.filter((ref) => ref.deref())).toHaveLength(0)
    await act(() => source.set(1))
    expect(source.get()).toBe(1)
  },
)

test('unrelated writes and subscription preserve computed values and snapshot identity', () => {
  const source = createAtom(1)
  const unrelated = createAtom(0)
  const accumulate = createAtom<number>(
    (previous = 0) => previous + source.get(),
  )
  const object = createAtom(() => ({ value: source.get() }))
  expect(accumulate.get()).toBe(1)
  const snapshot = object.get()
  unrelated.set(1)
  expect(accumulate.get()).toBe(1)
  expect(object.get()).toBe(snapshot)
  const subscription = object.subscribe(() => {})
  expect(object.get()).toBe(snapshot)
  subscription.unsubscribe()
  expect(object.get()).toBe(snapshot)
})

test('pending async atoms do not restart on unrelated writes or subscription', () => {
  const source = createAtom(1)
  const unrelated = createAtom(0)
  const load = vi.fn(() => {
    source.get()
    return new Promise<number>(() => {})
  })
  const derived = createAsyncAtom(load)
  const first = derived.get()
  unrelated.set(1)
  expect(derived.get()).toBe(first)
  const subscription = derived.subscribe(() => {})
  expect(derived.get()).toBe(first)
  expect(load).toHaveBeenCalledTimes(1)
  subscription.unsubscribe()
})

test.skipIf(!global.gc)(
  'nested throwing computations release their dependencies',
  async () => {
    const source = createAtom(0)
    function discard() {
      const inner = createAtom(() => {
        source.get()
        throw new Error('pending')
      })
      const outer = createAtom(() => inner.get())
      expect(() => outer.get()).toThrow('pending')
      return [new WeakRef(inner), new WeakRef(outer)]
    }
    const refs = discard()
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      global.gc!()
    }
    expect(refs.filter((ref) => ref.deref())).toHaveLength(0)
    expect(source.get()).toBe(0)
  },
)

test('unsubscribing during a batch does not cache a stale computed result', () => {
  const source = createAtom(1)
  const inner = createAtom(() => source.get() * 2)
  const outer = createAtom(() => inner.get() + 1)
  const subscription = outer.subscribe(() => {})
  expect(outer.get()).toBe(3)
  batch(() => {
    source.set(2)
    subscription.unsubscribe()
  })
  expect(outer.get()).toBe(5)
})

test('async completion discards the dependencies of its pending computation', async () => {
  const source = createAtom(1)
  const load = vi.fn(async () => source.get())
  const derived = createAsyncAtom(load)
  derived.get()
  await Promise.resolve()
  expect(derived.get()).toEqual({ status: 'done', data: 1 })
  const subscription = derived.subscribe(() => {})
  source.set(2)
  expect(derived.get()).toEqual({ status: 'done', data: 1 })
  expect(load).toHaveBeenCalledTimes(1)
  subscription.unsubscribe()
})

test('unobserved previous-value computations notice writes that return to the original value', () => {
  const source = createAtom(1)
  const derived = createAtom<number>((previous = 0) => previous + source.get())
  expect(derived.get()).toBe(1)
  source.set(2)
  source.set(1)
  expect(derived.get()).toBe(2)
})

test.skipIf(!global.gc)(
  'unobserved computations do not retain obsolete dependency values',
  async () => {
    function setup() {
      const payload = { value: 'old location payload' }
      const source = createAtom<{ value: number; payload?: object }>({
        value: 0,
      })
      source.set({ value: 1, payload })
      const derived = createAtom(() => source.get().value)
      expect(derived.get()).toBe(1)
      source.set({ value: 2 })
      return { source, derived, ref: new WeakRef(payload) }
    }
    const { source, derived, ref } = setup()
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      global.gc!()
    }
    expect(ref.deref()).toBeUndefined()
    expect(derived.get()).toBe(2)
    expect(source.get().value).toBe(2)
  },
)
