import '@analogjs/vitest-angular/setup-zone'
import '@testing-library/jest-dom/vitest'

/**
 * Initialize TestBed for all tests inside of content
 */
import { TestBed } from '@angular/core/testing'
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing'

TestBed.initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting(),
)
