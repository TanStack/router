import { afterEach, describe, expect, test, vi } from 'vitest'
import { createBrowserHistory } from '../src'
import type { RouterHistory } from '../src'

function createBrowserHistoryHarness() {
  const location = {
    pathname: '/',
    search: '',
    hash: '',
  }
  const pushState = vi.fn()
  const replaceState = vi.fn()
  const nativeHistory = {
    state: { __TSR_index: 0, __TSR_key: 'initial' },
    length: 1,
    pushState,
    replaceState,
    back: vi.fn(),
    forward: vi.fn(),
    go: vi.fn(),
  }
  const window = {
    location,
    history: nativeHistory,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  const history = createBrowserHistory({ window })

  return {
    history,
    pushState,
    replaceState,
  }
}

describe('createBrowserHistory', () => {
  let history: RouterHistory | undefined

  afterEach(() => {
    history?.destroy()
    history = undefined
  })

  test('coalesces consecutive replaces into the latest replace', async () => {
    const { history, pushState, replaceState } = createBrowserHistoryHarness()

    history.replace('/first', { value: 1 })
    history.replace('/second', { value: 2 })
    await Promise.resolve()

    expect(pushState).not.toHaveBeenCalled()
    expect(replaceState).toHaveBeenCalledTimes(1)
    expect(replaceState).toHaveBeenCalledWith(
      expect.objectContaining({ value: 2 }),
      '',
      '/second',
    )
    history.destroy()
  })

  test('promotes a queued replace to a push', async () => {
    const { history, pushState, replaceState } = createBrowserHistoryHarness()

    history.replace('/first', { value: 1 })
    history.push('/second', { value: 2 })
    await Promise.resolve()

    expect(replaceState).not.toHaveBeenCalled()
    expect(pushState).toHaveBeenCalledTimes(1)
    expect(pushState).toHaveBeenCalledWith(
      expect.objectContaining({ value: 2 }),
      '',
      '/second',
    )
    history.destroy()
  })

  test('keeps a queued push when followed by a replace', async () => {
    const { history, pushState, replaceState } = createBrowserHistoryHarness()

    history.push('/first', { value: 1 })
    history.replace('/second', { value: 2 })
    await Promise.resolve()

    expect(replaceState).not.toHaveBeenCalled()
    expect(pushState).toHaveBeenCalledTimes(1)
    expect(pushState).toHaveBeenCalledWith(
      expect.objectContaining({ value: 2 }),
      '',
      '/second',
    )
    history.destroy()
  })

  test('flushes a later action after an explicit flush', async () => {
    const { history, pushState, replaceState } = createBrowserHistoryHarness()

    history.replace('/first', { value: 1 })
    history.flush()
    await Promise.resolve()
    history.replace('/second', { value: 2 })
    await Promise.resolve()

    expect(pushState).not.toHaveBeenCalled()
    expect(replaceState).toHaveBeenCalledTimes(2)
    expect(replaceState).toHaveBeenLastCalledWith(
      expect.objectContaining({ value: 2 }),
      '',
      '/second',
    )
    history.destroy()
  })

  function setupTwoEntries(): RouterHistory {
    window.history.replaceState(
      { __TSR_index: 0, __TSR_key: 'one' },
      '',
      '/one',
    )
    window.history.pushState({ __TSR_index: 1, __TSR_key: 'two' }, '', '/two')
    history = createBrowserHistory()
    return history
  }

  describe('go respects the ignoreBlocker option', () => {
    test('go(-1) runs registered blockers by default', async () => {
      const history = setupTwoEntries()
      const blockerFn = vi.fn(async () => true)
      history.block({ blockerFn })

      history.go(-1)
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(blockerFn).toHaveBeenCalledTimes(1)
    })

    test('go(-1, { ignoreBlocker: true }) skips registered blockers', async () => {
      const history = setupTwoEntries()
      const blockerFn = vi.fn(async () => true)
      history.block({ blockerFn })

      history.go(-1, { ignoreBlocker: true })
      await new Promise((resolve) => setTimeout(resolve, 100))

      expect(blockerFn).not.toHaveBeenCalled()
    })
  })
})
