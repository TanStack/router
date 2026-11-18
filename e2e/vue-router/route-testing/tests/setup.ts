import { cleanup } from '@testing-library/vue'
import { afterEach, vi } from 'vitest'

// jsdom does not implement scrolling, which the router resets on navigation.
window.scrollTo = vi.fn()

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
