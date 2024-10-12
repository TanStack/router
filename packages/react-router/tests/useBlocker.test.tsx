import '@testing-library/jest-dom/vitest'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { useBlocker } from '../src'

const block = vi.fn()
vi.mock('../src/useRouter', () => ({
  useRouter: () => ({ history: { block } }),
}))

describe('useBlocker', () => {
  beforeEach(() => {
    block.mockClear()
  })

  describe('condition', () => {
    test('should not add the blocker if condition is false', () => {
      renderHook(() => useBlocker({ condition: false }))
      expect(block).not.toHaveBeenCalled()
    })

    test('should not add the blocker if condition is false (deprecated API)', () => {
      renderHook(() => useBlocker(undefined, false))
      expect(block).not.toHaveBeenCalled()
    })

    test('should add the blocker if condition is true', () => {
      renderHook(() => useBlocker({ condition: true }))
      expect(block).toHaveBeenCalledOnce()
    })

    test('should add the blocker if condition is true (deprecated API)', () => {
      renderHook(() => useBlocker(undefined, true))
      expect(block).toHaveBeenCalledOnce()
    })

    test('should add the blocker if condition is not provided', () => {
      renderHook(() => useBlocker())
      expect(block).toHaveBeenCalledOnce()
    })
  })
})
