import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Mock window.scrollTo to silence errors in tests
window.scrollTo = vi.fn()
