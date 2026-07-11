import { describe, expect, it } from 'vitest'
import { isModuleNotFoundError } from '../src/utils'

// https://github.com/TanStack/router/issues/7633
// isModuleNotFoundError only matched the Vite/native-ESM dynamic-import message
// prefixes, so webpack/rspack chunk failures (error.name === 'ChunkLoadError')
// were missed and lazyRouteComponent's one-shot reload-after-deploy recovery
// never fired on those bundlers.
describe('issue #7633 - isModuleNotFoundError detects webpack/rspack ChunkLoadError', () => {
  it('detects a ChunkLoadError by name', () => {
    const error = new Error('Loading chunk 42 failed.')
    error.name = 'ChunkLoadError'
    expect(isModuleNotFoundError(error)).toBe(true)
  })

  it('detects a ChunkLoadError even when message is not a string', () => {
    // Defensive about error shape: some bundlers surface a non-Error object.
    expect(isModuleNotFoundError({ name: 'ChunkLoadError' })).toBe(true)
  })

  it('still detects the native ESM / Vite message prefixes', () => {
    expect(
      isModuleNotFoundError(
        new Error('Failed to fetch dynamically imported module: /a.js'),
      ),
    ).toBe(true)
    expect(
      isModuleNotFoundError(
        new Error('error loading dynamically imported module: /a.js'),
      ),
    ).toBe(true)
    expect(
      isModuleNotFoundError(new Error('Importing a module script failed.')),
    ).toBe(true)
  })

  it('does not detect a generic error', () => {
    expect(isModuleNotFoundError(new Error('Loading chunk 42 failed.'))).toBe(
      false,
    )
    expect(isModuleNotFoundError(new Error('something else'))).toBe(false)
    expect(isModuleNotFoundError(undefined)).toBe(false)
    expect(isModuleNotFoundError(null)).toBe(false)
  })
})
