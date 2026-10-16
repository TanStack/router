import { describe, expect, it } from 'vitest'
import { normalizePath } from '../src/core/utils'

describe('normalizePath', () => {
  it('should convert Windows backslashes to forward slashes', () => {
    expect(normalizePath('C:\\Users\\project\\src\\routes\\index.tsx')).toBe(
      'C:/Users/project/src/routes/index.tsx',
    )
  })

  it('should handle mixed slashes', () => {
    expect(normalizePath('C:/Users\\project/src\\routes/index.tsx')).toBe(
      'C:/Users/project/src/routes/index.tsx',
    )
  })

  it('should leave forward slashes unchanged', () => {
    expect(normalizePath('/home/user/project/src/routes/index.tsx')).toBe(
      '/home/user/project/src/routes/index.tsx',
    )
  })

  it('should handle relative paths with backslashes', () => {
    expect(normalizePath('src\\routes\\index.tsx')).toBe('src/routes/index.tsx')
  })

  it('should handle empty string', () => {
    expect(normalizePath('')).toBe('')
  })

  it('should handle path with query string', () => {
    expect(normalizePath('C:\\project\\file.tsx?tsr-split=component')).toBe(
      'C:/project/file.tsx?tsr-split=component',
    )
  })
})
