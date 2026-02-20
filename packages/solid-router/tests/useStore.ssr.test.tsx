import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render } from '@solidjs/testing-library'
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

function Probe(props: { store: TestStore<number>; isServer: boolean }) {
  const value = useStore<number, number>(
    props.store as any,
    (snapshot) => snapshot * 2,
    { router: { isServer: props.isServer } },
  )

  return <div data-testid="value">{value()}</div>
}

afterEach(() => {
  cleanup()
})

describe('useStore SSR behavior', () => {
  test('returns a snapshot without subscribing when router is in server mode', () => {
    const { store } = createTestStore(21)

    const { getByTestId } = render(() => <Probe store={store} isServer={true} />)

    expect(getByTestId('value').textContent).toBe('42')
    expect(store.subscribe).not.toHaveBeenCalled()
  })

  test('subscribes in client mode', () => {
    const { store } = createTestStore(21)

    const { getByTestId } = render(() => (
      <Probe store={store} isServer={false} />
    ))

    expect(getByTestId('value').textContent).toBe('42')
    expect(store.subscribe).toHaveBeenCalled()
  })
})
