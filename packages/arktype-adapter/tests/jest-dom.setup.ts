import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { expect } from 'vitest'
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'

// Workaround for Vitest 5: remove once testing-library/jest-dom#742 is merged
// and released, and go back to `import '@testing-library/jest-dom/vitest'`.
// That entry imports `vitest` from its own install location, which can resolve
// a different Vitest copy than the one running these tests, and its types
// augment Vitest 4's `Assertion<T>` instead of Vitest 5's `Matchers<R, T>`.
// Keep `jest-dom` in this file name: vite-plugin-solid only skips injecting
// `@testing-library/jest-dom/vitest` when a setup file path contains it.
expect.extend(jestDomMatchers)

declare module 'vitest' {
  // Type parameter names must match Vitest's declaration for the interfaces to merge.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface Matchers<R, T> extends TestingLibraryMatchers<unknown, R> {}
}
