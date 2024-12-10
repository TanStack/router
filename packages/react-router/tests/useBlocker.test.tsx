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
    test('should not add a blocker if disabled is true', () => {
      renderHook(() =>
        useBlocker({ disabled: true, shouldBlockFn: () => true }),
      )
      expect(block).not.toHaveBeenCalled()
    })

    test('should add the blocker if not disabled', () => {
      renderHook(() => useBlocker({ shouldBlockFn: () => true }))
      expect(block).toHaveBeenCalledOnce()
    })

    test('Blocker object should be provided to blocker', () => {
      renderHook(() => useBlocker({ shouldBlockFn: () => true }))
      expect(block).toHaveBeenCalledWith(
        expect.objectContaining({ blockerFn: expect.any(Function) }),
      )
    })

    test('enableBeforeUnload should be passed to history.block', () => {
      renderHook(() =>
        useBlocker({ shouldBlockFn: () => true, enableBeforeUnload: false }),
      )
      expect(block).toHaveBeenCalledWith(
        expect.objectContaining({ enableBeforeUnload: false }),
      )
    })
  })
})
