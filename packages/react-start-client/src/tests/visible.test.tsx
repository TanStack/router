import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { act, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Hydrate } from '../Hydrate'
import { visible } from '../hydration'

afterEach(() => {
  vi.unstubAllGlobals()
})

it('replays a suspended visible() boundary without a hook mismatch', async () => {
  let reveal: (() => void) | undefined
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        reveal = () =>
          callback(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            this as never,
          )
      }
      observe() {}
      disconnect() {}
    },
  )
  const errors: Array<unknown> = []
  const onHydrated = vi.fn()
  let rerender!: () => void
  let revealDuringRender = false

  // Rendered before the boundary: it reveals the boundary from a microtask, so
  // the gate resolves after HydrationBoundary suspends on it but before React
  // gives up on that render, and React replays the suspended mount.
  function Kick() {
    if (revealDuringRender) {
      revealDuringRender = false
      queueMicrotask(() => reveal?.())
    }
    return null
  }

  function App() {
    const [, setTick] = React.useState(0)
    rerender = () => React.startTransition(() => setTick((t) => t + 1))
    return (
      <>
        <Kick />
        <Hydrate
          when={visible()}
          fallback={<div data-testid="fallback" />}
          onHydrated={onHydrated}
        >
          <div data-testid="child" />
        </Hydrate>
      </>
    )
  }

  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container, {
    onRecoverableError: (error) => errors.push(error),
  })

  act(() => {
    root.render(<App />)
  })
  expect(screen.getByTestId('fallback')).toBeTruthy()

  await act(async () => {
    revealDuringRender = true
    rerender()
    await new Promise((resolve) => setTimeout(resolve, 20))
  })

  expect(errors).toEqual([])
  expect(screen.getByTestId('child')).toBeTruthy()
  expect(onHydrated).toHaveBeenCalledTimes(1)

  act(() => root.unmount())
  container.remove()
})
