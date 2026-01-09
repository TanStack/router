import '@angular/compiler'
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed'

setupTestBed()

// Mock window.scrollTo to silence errors in tests
window.scrollTo = vi.fn()
