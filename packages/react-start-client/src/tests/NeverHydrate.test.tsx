import * as React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { Hydrate } from '../Hydrate'
import { never as neverStrategy } from '../hydration/never'

afterEach(() => {
  cleanup()
})

describe('never hydration strategy', function describeNever() {
  it('reports hydration once even when the parent re-renders', () => {
    const calls: Array<number> = []
    let rerenderParent: () => void = () => {}

    function Parent() {
      const [n, setN] = React.useState(0)
      rerenderParent = () => setN((v) => v + 1)
      return (
        <div>
          <span>render {n}</span>
          {/* A fresh arrow on every render is what a parent hands down. */}
          <Hydrate when={neverStrategy()} onHydrated={() => calls.push(n)}>
            child
          </Hydrate>
        </div>
      )
    }

    const { getByText } = render(<Parent />)

    expect(calls).toHaveLength(1)

    act(() => {
      rerenderParent()
    })

    // The parent really re-rendered, and passed a different callback.
    expect(getByText('render 1')).toBeTruthy()
    expect(calls).toHaveLength(1)
  })
})
