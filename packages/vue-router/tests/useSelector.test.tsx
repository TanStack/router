import * as Vue from 'vue'
import { render } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'
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

    const view = render(Component)
    const initialSelection = selected!.value
    setState({ count: 0 })

    expect(selected!.value).toBe(initialSelection)
    view.unmount()
  })
})
