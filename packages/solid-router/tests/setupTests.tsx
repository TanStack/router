import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// @ts-expect-error
global.IS_REACT_ACT_ENVIRONMENT = true

// Mock window.scrollTo to silence errors in tests
window.scrollTo = vi.fn()

// Suppress unhandled rejection warnings for stale value errors during async transitions
process.on('unhandledRejection', (reason: any) => {
  const message = reason?.message || reason?.toString() || ''

  // Suppress Solid's "stale value" warning
  if (message.includes('Attempting to access a stale value from <Match>')) {
    return
  }

  // Suppress useMatch invariant errors during async transition cleanup
  if (
    message.includes('Could not find an active match from') ||
    message.includes('Could not find a match') ||
    message.includes('Could not find match for matchId') ||
    message.includes('Could not find parent match for matchId')
  ) {
    return
  }

  // Re-throw other unhandled rejections
  throw reason
})
