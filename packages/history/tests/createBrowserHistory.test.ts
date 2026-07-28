import { afterEach, describe, expect, test, vi } from 'vitest'

import { createBrowserHistory } from '../src'
import type { BlockerFn, RouterHistory } from '../src'

describe('createBrowserHistory', () => {
  let history: RouterHistory | undefined

  afterEach(() => {
    history?.destroy()
    history = undefined
    vi.restoreAllMocks()
  })

  function setupEntries(
    firstPath: string,
    ...remainingPaths: Array<string>
  ): RouterHistory {
    window.history.replaceState(
      { __TSR_index: 0, __TSR_key: 'entry-0' },
      '',
      firstPath,
    )
    remainingPaths.forEach((path, index) => {
      const historyIndex = index + 1
      window.history.pushState(
        {
          __TSR_index: historyIndex,
          __TSR_key: `entry-${historyIndex}`,
        },
        '',
        path,
      )
    })

    history = createBrowserHistory()
    return history
  }

  async function expectLocation(pathname: string) {
    await vi.waitFor(() => {
      expect(window.location.pathname).toBe(pathname)
      expect(history?.location.pathname).toBe(pathname)
    })
  }

  test('restores the current entry when a forward navigation is blocked', async () => {
    const history = setupEntries('/one', '/two')
    history.back()
    await expectLocation('/one')
    const blockerFn = vi.fn(() => true)
    history.block({ blockerFn })

    history.forward()

    await vi.waitFor(() => expect(blockerFn).toHaveBeenCalledOnce())
    await expectLocation('/one')
  })

  test('restores the exact current entry when a multi-entry navigation is blocked', async () => {
    const history = setupEntries('/one', '/two', '/three')
    const blockerFn = vi.fn(() => true)
    history.block({ blockerFn })

    history.go(-2)

    await vi.waitFor(() => expect(blockerFn).toHaveBeenCalledOnce())
    await expectLocation('/three')
  })

  test('accepts a blocked pop with zero delta instead of reloading', async () => {
    window.history.replaceState(
      { __TSR_index: 0, __TSR_key: 'entry-0' },
      '',
      '/one',
    )
    window.history.pushState(
      { __TSR_index: 0, __TSR_key: 'entry-1' },
      '',
      '/two',
    )
    history = createBrowserHistory()
    const blockerFn = vi.fn(() => true)
    history.block({ blockerFn })
    const goSpy = vi.spyOn(window.history, 'go')
    const subscriber = vi.fn()
    history.subscribe(subscriber)

    history.back()

    await vi.waitFor(() => expect(blockerFn).toHaveBeenCalledOnce())
    await expectLocation('/one')
    expect(goSpy).not.toHaveBeenCalled()
    expect(subscriber).toHaveBeenLastCalledWith({
      location: expect.objectContaining({ pathname: '/one' }),
      action: { type: 'GO', index: 0 },
    })
  })

  test('accepts a blocked pop into a legacy history entry without reloading', async () => {
    // A hard reload after switching routers preserves older pushState entries.
    // The active entry is already TanStack history, while the previous entry
    // still has the history@4 `{ key, state }` shape and no `__TSR_index`.
    const legacyState = {
      key: 'history-v4-entry',
      state: { source: 'history@4' },
    }
    window.history.replaceState(legacyState, '', '/legacy')
    window.history.pushState(
      { __TSR_index: 1, __TSR_key: 'tanstack-entry' },
      '',
      '/current',
    )
    history = createBrowserHistory()
    let observedDelta: number | undefined
    const blockerFn = vi.fn<BlockerFn>(({ currentLocation, nextLocation }) => {
      observedDelta =
        Reflect.get(nextLocation.state, '__TSR_index') -
        currentLocation.state.__TSR_index
      return true
    })
    history.block({ blockerFn })
    const goSpy = vi.spyOn(window.history, 'go')
    const subscriber = vi.fn()
    history.subscribe(subscriber)

    history.back()

    await vi.waitFor(() => expect(blockerFn).toHaveBeenCalledOnce())
    expect(observedDelta).toBeNaN()
    await expectLocation('/legacy')
    expect(history.location.state).toEqual(legacyState)
    expect(goSpy).not.toHaveBeenCalled()
    expect(subscriber).toHaveBeenLastCalledWith({
      location: expect.objectContaining({
        pathname: '/legacy',
        state: legacyState,
      }),
      action: expect.objectContaining({ type: 'GO' }),
    })
  })
})
