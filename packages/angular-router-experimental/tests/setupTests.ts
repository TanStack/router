import '@angular/compiler'
import '@testing-library/jest-dom/vitest'
import { TestBed } from '@angular/core/testing'
import { afterEach, vi } from 'vitest'
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed'

setupTestBed()

afterEach(() => {
  TestBed.resetTestingModule()
})

// Mock window.scrollTo to silence errors in tests
window.scrollTo = vi.fn()
