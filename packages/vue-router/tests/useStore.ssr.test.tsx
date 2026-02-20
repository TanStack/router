import * as Vue from 'vue'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render } from '@testing-library/vue'
import { useStore } from '../src/useStore'

type TestStore<T> = {
  get: () => T
  subscribe: () => { unsubscribe: () => void }
}

function createTestStore<T>(value: T) {
  const unsubscribe = vi.fn()

  const store: TestStore<T> = {
    get: vi.fn(() => value),
    subscribe: vi.fn(() => ({ unsubscribe })),
  }

  return { store, unsubscribe }
}

const Probe = Vue.defineComponent({
  name: 'Probe',
  props: {
    store: {
      type: Object as Vue.PropType<TestStore<number>>,
      required: true,
    },
    isServer: {
      type: Boolean,
      required: true,
    },
  },
  setup(props) {
    const value = useStore<number, number>(
      props.store as any,
      (snapshot) => snapshot * 2,
      { router: { isServer: props.isServer } },
    )

    return () => <div data-testid="value">{value.value}</div>
  },
})

afterEach(() => {
  cleanup()
})

describe('useStore SSR behavior', () => {
  test('returns a snapshot without subscribing when router is in server mode', () => {
    const { store } = createTestStore(21)

    const { getByTestId } = render(Probe, {
      props: {
        store,
        isServer: true,
      },
    })

    expect(getByTestId('value').textContent).toBe('42')
    expect(store.subscribe).not.toHaveBeenCalled()
  })

  test('subscribes in client mode', async () => {
    const { store } = createTestStore(21)

    const { getByTestId } = render(Probe, {
      props: {
        store,
        isServer: false,
      },
    })

    await Vue.nextTick()

    expect(getByTestId('value').textContent).toBe('42')
    expect(store.subscribe).toHaveBeenCalled()
  })
})
