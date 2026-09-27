import React from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

test.each(['leave', 'blur', 'unmount'] as const)(
  'cancels a zero-valued intent timer on %s and allows a later preload',
  async (cancel) => {
    const loader = vi.fn(() => 'about')
    const root = createRootRoute()
    const router = createRouter({
      routeTree: root.addChildren([
        createRoute({ getParentRoute: () => root, path: '/' }),
        createRoute({ getParentRoute: () => root, path: '/about', loader }),
      ]),
      history: createMemoryHistory(),
    })
    await router.load()
    const tree = (
      <RouterContextProvider router={router}>
        <Link to="/about" preload="intent" preloadDelay={83}>
          About
        </Link>
      </RouterContextProvider>
    )
    let view = render(tree)
    vi.useFakeTimers()
    const schedule = globalThis.setTimeout
    const clear = globalThis.clearTimeout
    let pending: ReturnType<typeof setTimeout> | undefined
    // Model a browser scheduler whose first valid timer handle is zero.
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(
      (handler, delay, ...args) => {
        const handle = schedule(handler, delay, ...args)
        if (delay === 83) {
          pending = handle
          return 0 as unknown as ReturnType<typeof setTimeout>
        }
        return handle
      },
    )
    vi.spyOn(globalThis, 'clearTimeout').mockImplementation((handle) => {
      clear(handle === 0 ? pending : handle)
    })

    fireEvent.mouseEnter(view.getByRole('link'))
    if (cancel === 'unmount') {
      view.unmount()
    } else if (cancel === 'leave') {
      fireEvent.mouseLeave(view.getByRole('link'))
    } else {
      fireEvent.blur(view.getByRole('link'))
    }
    await act(() => vi.advanceTimersByTimeAsync(83))
    expect(loader).not.toHaveBeenCalled()

    if (cancel === 'unmount') {
      view = render(tree)
    }
    fireEvent.mouseEnter(view.getByRole('link'))
    await act(() => vi.advanceTimersByTimeAsync(83))
    expect(loader).toHaveBeenCalledTimes(1)
  },
)
