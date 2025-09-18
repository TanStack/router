import { describe, expect, test, vi } from 'vitest'
import { createBrowserHistory } from '../src'

describe('ignoreBlocker functionality', () => {
  test('go method should respect ignoreBlocker option', () => {
    const mockWindow = {
      history: {
        pushState: vi.fn(),
        replaceState: vi.fn(),
        go: vi.fn(),
        back: vi.fn(),
        forward: vi.fn(),
        length: 3,
        state: { __TSR_index: 2 },
      },
      location: {
        pathname: '/a',
        search: '',
        hash: '',
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }

    const history = createBrowserHistory({ window: mockWindow })
    const blocker = vi.fn(() => true)

    const unblock = history.block({ blockerFn: blocker })

    history.go(-2, { ignoreBlocker: true })
    expect(mockWindow.history.go).toHaveBeenCalledWith(-2)

    unblock()
  })

  test('back method should respect ignoreBlocker option', () => {
    const mockWindow = {
      history: {
        pushState: vi.fn(),
        replaceState: vi.fn(),
        go: vi.fn(),
        back: vi.fn(),
        forward: vi.fn(),
        length: 3,
        state: { __TSR_index: 2 },
      },
      location: {
        pathname: '/a',
        search: '',
        hash: '',
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }

    const history = createBrowserHistory({ window: mockWindow })
    const blocker = vi.fn(() => true)

    const unblock = history.block({ blockerFn: blocker })

    history.back({ ignoreBlocker: true })
    expect(mockWindow.history.back).toHaveBeenCalled()

    unblock()
  })

  test('forward method should respect ignoreBlocker option', () => {
    const mockWindow = {
      history: {
        pushState: vi.fn(),
        replaceState: vi.fn(),
        go: vi.fn(),
        back: vi.fn(),
        forward: vi.fn(),
        length: 3,
        state: { __TSR_index: 2 },
      },
      location: {
        pathname: '/a',
        search: '',
        hash: '',
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }

    const history = createBrowserHistory({ window: mockWindow })
    const blocker = vi.fn(() => true)

    const unblock = history.block({ blockerFn: blocker })

    history.forward({ ignoreBlocker: true })
    expect(mockWindow.history.forward).toHaveBeenCalled()

    unblock()
  })
})
