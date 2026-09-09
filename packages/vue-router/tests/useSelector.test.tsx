import * as Vue from 'vue'
import { cleanup, render } from '@testing-library/vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useSelector } from '../src/useSelector'

type State = { count: number }

function createStore(initialState: State) {
  let state = initialState
  const listeners = new Set<(state: State) => void>()
  const unsubscribe = vi.fn((listener: (state: State) => void) => {
    listeners.delete(listener)
  })

  return {
    store: {
      get: () => state,
      subscribe: vi.fn((listener: (state: State) => void) => {
        listeners.add(listener)
        return { unsubscribe: () => unsubscribe(listener) }
      }),
    },
    setState(nextState: State) {
      state = nextState
      listeners.forEach((listener) => listener(state))
    },
    unsubscribe,
  }
}

afterEach(cleanup)

describe('useSelector', () => {
  it('cleans up a functional component subscription on unmount', () => {
    const { store, unsubscribe } = createStore({ count: 0 })
    const Component = () => {
      const count = useSelector(store, (state) => state.count)
      return <div>{count.value}</div>
    }

    const view = render(Component)
    view.unmount()

    expect(store.subscribe).toHaveBeenCalledOnce()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('updates the selection and cleans up when its existing scope stops', () => {
    const { store, setState, unsubscribe } = createStore({ count: 0 })
    const scope = Vue.effectScope()
    const selected = scope.run(() => useSelector(store))!

    expect(selected.value.count).toBe(0)
    setState({ count: 1 })
    expect(selected.value.count).toBe(1)

    scope.stop()
    expect(unsubscribe).toHaveBeenCalledOnce()
    setState({ count: 2 })
    expect(selected.value.count).toBe(1)
  })

  it('passes comparator options to the upstream selector', () => {
    const { store, setState } = createStore({ count: 0 })
    let selected: Readonly<Vue.Ref<State>> | undefined
    const Component = Vue.defineComponent({
      setup() {
        const selection = useSelector(store, (state) => state, {
          compare: (previous, next) => previous.count === next.count,
        })
        selected = selection
        return () => <div>{selection.value.count}</div>
      },
    })

    render(Component)
    const initialSelection = selected!.value
    setState({ count: 0 })

    expect(selected!.value).toBe(initialSelection)

    setState({ count: 1 })
    expect(selected!.value.count).toBe(1)
    expect(selected!.value).not.toBe(initialSelection)
  })
})
