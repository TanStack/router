import { describe, expect, test, vi } from 'vitest'
import { createBrowserHistory } from '../src'

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
})
