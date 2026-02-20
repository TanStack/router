import * as React from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { AnyAtom } from '@tanstack/react-store'
import { useStore } from '../src/useStore'

type TestStore<T> = {
  get: () => T
  subscribe: AnyAtom['subscribe']
}

function createTestStore<T>(value: T) {
  const unsubscribe = vi.fn()

  const store: TestStore<T> = {
    get: vi.fn(() => value),
    subscribe: vi.fn(() => ({ unsubscribe })) as AnyAtom['subscribe'],
  }

  return { store, unsubscribe }
}

function Probe(props: { store: TestStore<number>; isServer: boolean }) {
  const value = useStore(
    props.store,
    (snapshot) => snapshot * 2,
    { router: { isServer: props.isServer } },
  )

  return <div data-testid="value">{value}</div>
}

afterEach(() => {
  cleanup()
})

describe('useStore SSR behavior', () => {
  test('returns a snapshot without subscribing when router is in server mode', () => {
    const { store } = createTestStore(21)

    render(<Probe store={store} isServer={true} />)

    expect(screen.getByTestId('value').textContent).toBe('42')
    expect(store.subscribe).not.toHaveBeenCalled()
  })

  test('subscribes in client mode', () => {
    const { store } = createTestStore(21)

    render(<Probe store={store} isServer={false} />)

    expect(screen.getByTestId('value').textContent).toBe('42')
    expect(store.subscribe).toHaveBeenCalled()
  })
})
