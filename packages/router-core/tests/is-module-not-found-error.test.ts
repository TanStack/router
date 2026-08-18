import { describe, expect, it } from 'vitest'
import { isModuleNotFoundError } from '../src/utils'

describe('isModuleNotFoundError', () => {
  it('detects Chrome dynamic import error', () => {
    const error = new Error(
      'Failed to fetch dynamically imported module: http://localhost:5173/src/routes/posts.index.tsx?tsr-split',
    )
    expect(isModuleNotFoundError(error)).toBe(true)
  })

  it('detects Firefox dynamic import error', () => {
    const error = new Error(
      'error loading dynamically imported module: http://localhost:5173/src/routes/posts.index.tsx?tsr-split',
    )
    expect(isModuleNotFoundError(error)).toBe(true)
  })

  it('detects Safari dynamic import error', () => {
    const error = new Error('Importing a module script failed.')
    expect(isModuleNotFoundError(error)).toBe(true)
  })

  it('detects Webpack ChunkLoadError by name', () => {
    // Webpack throws a ChunkLoadError with a distinct name property
    const error = new Error('Loading chunk 123 failed.\n(error: http://localhost:3333/js/123.abc123.chunk.js)')
    error.name = 'ChunkLoadError'
    expect(isModuleNotFoundError(error)).toBe(true)
  })

  it('detects Webpack-style error by message prefix when name is generic', () => {
    // Fallback: even without ChunkLoadError name, the message prefix catches it
    const error = new Error('Loading chunk abc123 failed.\n(error: http://localhost:3333/js/main.abc123.js)')
    expect(isModuleNotFoundError(error)).toBe(true)
  })

  it('detects Rspack ChunkLoadError', () => {
    const error = new Error('Loading chunk 456 failed.\n(error: http://localhost:3333/js/456.def456.chunk.js)')
    error.name = 'ChunkLoadError'
    expect(isModuleNotFoundError(error)).toBe(true)
  })

  it('returns false for null input', () => {
    expect(isModuleNotFoundError(null)).toBe(false)
  })

  it('returns false for undefined input', () => {
    expect(isModuleNotFoundError(undefined)).toBe(false)
  })

  it('returns false for non-error objects', () => {
    expect(isModuleNotFoundError({})).toBe(false)
    expect(isModuleNotFoundError('string error')).toBe(false)
    expect(isModuleNotFoundError(42)).toBe(false)
  })

  it('returns false for unrelated errors', () => {
    const error = new Error('Something went wrong')
    expect(isModuleNotFoundError(error)).toBe(false)
  })

  it('returns false for errors without a message', () => {
    const error = {}
    expect(isModuleNotFoundError(error)).toBe(false)
  })
})
