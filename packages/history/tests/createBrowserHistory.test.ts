import { afterEach, describe, expect, test, vi } from 'vitest'

import { createBrowserHistory } from '../src'
import type { RouterHistory } from '../src'

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
})
