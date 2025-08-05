import { describe, expect, test, vi } from 'vitest'
import { createBrowserHistory } from '../src'

describe('ignoreBlocker functionality', () => {
  test('ignoreBlocker should work with browser history', () => {
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

    history.go(-1, { ignoreBlocker: true })
    expect(mockWindow.history.go).toHaveBeenCalledWith(-1)

    unblock()
  })
})
