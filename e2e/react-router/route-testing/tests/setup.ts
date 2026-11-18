import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// @ts-expect-error React reads this flag to know that updates are wrapped in act().
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// jsdom does not implement scrolling, which the router resets on navigation.
window.scrollTo = vi.fn()

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
