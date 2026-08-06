import * as Vue from 'vue'
import { render } from '@testing-library/vue'
import { expect, test, vi } from 'vitest'
import { useSelector } from '../src/useSelector'

function createStore(initialValue: number) {
  let value = initialValue
  const listeners = new Set<(value: number) => void>()
  const unsubscribe = vi.fn((listener: (value: number) => void) => {
    listeners.delete(listener)
  })
  const subscribe = vi.fn((listener: (value: number) => void) => {
    listeners.add(listener)
    return { unsubscribe: () => unsubscribe(listener) }
  })

  return {
    store: {
      get: () => value,
      subscribe,
    },
    setValue(nextValue: number) {
      value = nextValue
      listeners.forEach((listener) => listener(value))
    },
    listenerCount: () => listeners.size,
    subscribe,
    unsubscribe,
  }
}

test('replaces functional component subscriptions on rerender', async () => {
  const source = createStore(0)
  const label = Vue.ref('first')
  const Component = () => {
    const value = useSelector(source.store)
    return <div>{`${label.value}:${value.value}`}</div>
  }

  const view = render(Component)

  expect(source.subscribe).toHaveBeenCalledOnce()
  expect(source.listenerCount()).toBe(1)

  label.value = 'second'
  await Vue.nextTick()

  expect(source.subscribe).toHaveBeenCalledTimes(2)
  expect(source.unsubscribe).toHaveBeenCalledOnce()
  expect(source.listenerCount()).toBe(1)

  source.setValue(1)
  await Vue.nextTick()

  expect(view.getByText('second:1')).toBeInTheDocument()
  expect(source.subscribe).toHaveBeenCalledTimes(3)
  expect(source.unsubscribe).toHaveBeenCalledTimes(2)
  expect(source.listenerCount()).toBe(1)

  view.unmount()

  expect(source.unsubscribe).toHaveBeenCalledTimes(3)
  expect(source.listenerCount()).toBe(0)
})
