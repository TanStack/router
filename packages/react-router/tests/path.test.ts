import { describe, expect, it } from 'vitest'
import { exactPathTest, removeTrailingSlash } from '../src/path'

describe('removeTrailingSlash', () => {
  it('should remove trailing slash if present', () => {
    const input = 'https://example.com/'
    const expectedOutput = 'https://example.com'
    const result = removeTrailingSlash(input, '/')
    expect(result).toBe(expectedOutput)
  })
  it('should not modify the string if no trailing slash present', () => {
    const input = 'https://example.com'
    const result = removeTrailingSlash(input, '/')
    expect(result).toBe(input)
  })
  it('should handle empty string', () => {
    const input = ''
    const result = removeTrailingSlash(input, '/')
    expect(result).toBe(input)
  })
  it('should handle strings with only a slash', () => {
    const input = '/'
    const result = removeTrailingSlash(input, '/')
    expect(result).toBe(input)
  })
  it('should handle strings with multiple slashes', () => {
    const input = 'https://example.com/path/to/resource/'
    const expectedOutput = 'https://example.com/path/to/resource'
    const result = removeTrailingSlash(input, '/')
    expect(result).toBe(expectedOutput)
  })
})

describe('exactPathTest', () => {
  it('should return true when two paths are exactly the same', () => {
    const path1 = 'some-path/additional-path'
    const path2 = 'some-path/additional-path'
    const result = exactPathTest(path1, path2, '/')
    expect(result).toBe(true)
  })

  it('should return true when two paths are the same with or without trailing slash', () => {
    const path1 = 'some-path/additional-path'
    const path2 = 'some-path/additional-path/'
    const result = exactPathTest(path1, path2, '/')
    expect(result).toBe(true)
  })
  it('should return true when two paths are the same with or without trailing slash 2', () => {
    const path1 = 'some-path/additional-path'
    const path2 = 'some-path/additional-path/'
    const result = exactPathTest(path1, path2, '/')
    expect(result).toBe(true)
  })

  it('should return false when two paths are different', () => {
    const path1 = 'some-path/additional-path/'
    const path2 = 'some-path2/additional-path/'
    const result = exactPathTest(path1, path2, '/')
    expect(result).toBe(false)
  })

  it('should return true when both paths are just a slash', () => {
    const path1 = '/'
    const path2 = '/'
    const result = exactPathTest(path1, path2, '/')
    expect(result).toBe(true)
  })
})
