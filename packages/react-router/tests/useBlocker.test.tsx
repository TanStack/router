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
      renderHook(() => useBlocker({ disabled: true, blockerFn: () => true }))
      expect(block).not.toHaveBeenCalled()
    })

    test('should add the blocker if not disabled', () => {
      renderHook(() => useBlocker({ blockerFn: () => true }))
      expect(block).toHaveBeenCalledOnce()
    })

    test('Blocker object should be provided to blocker', () => {
      renderHook(() => useBlocker({ blockerFn: () => true }))
      expect(block).toHaveBeenCalledWith(
        expect.objectContaining({ blockerFn: expect.any(Function) }),
      )
    })

    test('disableBeforeUnload should be passed to history.block', () => {
      renderHook(() =>
        useBlocker({ blockerFn: () => true, disableBeforeUnload: true }),
      )
      expect(block).toHaveBeenCalledWith(
        expect.objectContaining({ disableBeforeUnload: true }),
      )
    })
  })
})
