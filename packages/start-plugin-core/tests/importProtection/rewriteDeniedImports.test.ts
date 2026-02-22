import { describe, expect, test } from 'vitest'

import {
  collectMockExportNamesBySource,
  isValidExportName,
} from '../../src/import-protection-plugin/rewriteDeniedImports'

describe('isValidExportName', () => {
  test('rejects "default"', () => {
    expect(isValidExportName('default')).toBe(false)
  })

  test('accepts valid JS identifiers', () => {
    expect(isValidExportName('foo')).toBe(true)
    expect(isValidExportName('_private')).toBe(true)
    expect(isValidExportName('$ref')).toBe(true)
    expect(isValidExportName('camelCase')).toBe(true)
    expect(isValidExportName('A')).toBe(true)
  })

  test('rejects names starting with a digit', () => {
    expect(isValidExportName('1foo')).toBe(false)
  })

  test('rejects names with special characters', () => {
    expect(isValidExportName('foo-bar')).toBe(false)
    expect(isValidExportName('foo.bar')).toBe(false)
    expect(isValidExportName('foo bar')).toBe(false)
  })

  test('rejects empty string', () => {
    expect(isValidExportName('')).toBe(false)
  })
})

describe('collectMockExportNamesBySource', () => {
  test('collects named imports', () => {
    const code = `import { alpha, beta } from 'mod-a'`
    const result = collectMockExportNamesBySource(code)
    expect(result.get('mod-a')).toEqual(['alpha', 'beta'])
  })

  test('ignores default imports', () => {
    const code = `import def from 'mod-a'`
    const result = collectMockExportNamesBySource(code)
    expect(result.has('mod-a')).toBe(false)
  })

  test('ignores namespace imports', () => {
    const code = `import * as ns from 'mod-a'`
    const result = collectMockExportNamesBySource(code)
    expect(result.has('mod-a')).toBe(false)
  })

  test('ignores type-only imports', () => {
    const code = `import type { Foo } from 'mod-a'`
    const result = collectMockExportNamesBySource(code)
    expect(result.has('mod-a')).toBe(false)
  })

  test('ignores type-only specifiers in value imports', () => {
    const code = `import { type Foo, bar } from 'mod-a'`
    const result = collectMockExportNamesBySource(code)
    expect(result.get('mod-a')).toEqual(['bar'])
  })

  test('ignores "import { default as x }" specifiers', () => {
    const code = `import { default as myDefault } from 'mod-a'`
    const result = collectMockExportNamesBySource(code)
    expect(result.has('mod-a')).toBe(false)
  })

  test('collects from re-exports', () => {
    const code = `export { alpha, beta } from 'mod-a'`
    const result = collectMockExportNamesBySource(code)
    expect(result.get('mod-a')).toEqual(['alpha', 'beta'])
  })

  test('ignores type-only re-exports', () => {
    const code = `export type { Foo } from 'mod-a'`
    const result = collectMockExportNamesBySource(code)
    expect(result.has('mod-a')).toBe(false)
  })

  test('merges specifiers from multiple imports of the same source', () => {
    const code = [
      `import { alpha } from 'mod-a'`,
      `import { beta } from 'mod-a'`,
    ].join('\n')
    const result = collectMockExportNamesBySource(code)
    expect(result.get('mod-a')).toEqual(['alpha', 'beta'])
  })

  test('dedupes specifiers from import and re-export of same source', () => {
    const code = [
      `import { alpha } from 'mod-a'`,
      `export { alpha } from 'mod-a'`,
    ].join('\n')
    const result = collectMockExportNamesBySource(code)
    expect(result.get('mod-a')).toEqual(['alpha'])
  })

  test('sorts output alphabetically', () => {
    const code = `import { zeta, alpha, mu } from 'mod-a'`
    const result = collectMockExportNamesBySource(code)
    expect(result.get('mod-a')).toEqual(['alpha', 'mu', 'zeta'])
  })

  test('handles multiple sources', () => {
    const code = [
      `import { a } from 'mod-a'`,
      `import { b } from 'mod-b'`,
    ].join('\n')
    const result = collectMockExportNamesBySource(code)
    expect(result.get('mod-a')).toEqual(['a'])
    expect(result.get('mod-b')).toEqual(['b'])
  })

  test('returns empty map for code with no relevant imports', () => {
    const code = `const x = 1`
    const result = collectMockExportNamesBySource(code)
    expect(result.size).toBe(0)
  })

  test('collects ES2022 string-keyed import specifiers', () => {
    const code = `import { "foo-bar" as x } from 'mod-a'`
    const result = collectMockExportNamesBySource(code)
    expect(result.get('mod-a')).toEqual(['foo-bar'])
  })
})
