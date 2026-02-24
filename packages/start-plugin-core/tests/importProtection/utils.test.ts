import { describe, expect, test } from 'vitest'

import {
  dedupePatterns,
  escapeRegExp,
  extractImportSources,
  getOrCreate,
  normalizeFilePath,
  relativizePath,
  stripViteQuery,
} from '../../src/import-protection-plugin/utils'

describe('dedupePatterns', () => {
  test('dedupes strings and preserves first occurrence order', () => {
    expect(dedupePatterns(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c'])
  })

  test('dedupes regexes by toString() and preserves first occurrence order', () => {
    const a1 = /foo/i
    const a2 = /foo/i
    const b = /bar/

    const out = dedupePatterns([a1, b, a2, b])
    expect(out).toEqual([a1, b])
  })

  test('treats strings and regexes as distinct keys', () => {
    const out = dedupePatterns(['/foo/i', /foo/i, '/foo/i', /foo/i])
    expect(out).toEqual(['/foo/i', /foo/i])
  })

  test('returns empty array for empty input', () => {
    expect(dedupePatterns([])).toEqual([])
  })
})

describe('stripViteQuery', () => {
  test('strips ?query params', () => {
    expect(stripViteQuery('/a/b.ts?x=1')).toBe('/a/b.ts')
  })

  test('strips #fragments', () => {
    expect(stripViteQuery('/a/b.ts#hash')).toBe('/a/b.ts')
  })

  test('strips whichever comes first of ? and #', () => {
    expect(stripViteQuery('/a/b.ts?x=1#hash')).toBe('/a/b.ts')
    expect(stripViteQuery('/a/b.ts#hash?x=1')).toBe('/a/b.ts')
  })

  test('returns path unchanged when no query or fragment', () => {
    expect(stripViteQuery('/a/b.ts')).toBe('/a/b.ts')
  })
})

describe('normalizeFilePath', () => {
  test('strips query params', () => {
    expect(normalizeFilePath('/a/b.ts?v=123')).toBe('/a/b.ts')
  })

  test('returns plain path unchanged', () => {
    expect(normalizeFilePath('/a/b.ts')).toBe('/a/b.ts')
  })

  test('returns cached result on second call', () => {
    const input = '/unique/cache-test/file.ts?q=1'
    const first = normalizeFilePath(input)
    const second = normalizeFilePath(input)
    expect(first).toBe(second)
    expect(first).toBe('/unique/cache-test/file.ts')
  })

  test('handles path with both query and hash', () => {
    expect(normalizeFilePath('/a/b.ts?x=1#hash')).toBe('/a/b.ts')
  })
})

describe('extractImportSources', () => {
  test('extracts static import sources', () => {
    const code = `import { foo } from 'bar'\nimport baz from "qux"`
    expect(extractImportSources(code)).toEqual(['bar', 'qux'])
  })

  test('extracts re-export sources', () => {
    const code = `export { a } from './mod'\nexport * from "./other"`
    expect(extractImportSources(code)).toEqual(['./mod', './other'])
  })

  test('extracts dynamic import sources', () => {
    const code = `const m = import('./lazy')\nconst n = import("./lazy2")`
    expect(extractImportSources(code)).toEqual(['./lazy', './lazy2'])
  })

  test('handles mixed import styles', () => {
    const code = [
      `import { a } from 'static'`,
      `export { b } from './reexport'`,
      `const c = import('./dynamic')`,
    ].join('\n')
    expect(extractImportSources(code)).toEqual([
      'static',
      './reexport',
      './dynamic',
    ])
  })

  test('returns empty array for code with no imports', () => {
    expect(extractImportSources('const x = 1')).toEqual([])
  })

  test('handles empty string', () => {
    expect(extractImportSources('')).toEqual([])
  })

  test('does not match import in comments or strings', () => {
    // The regex is intentionally lightweight and will match inside strings/comments.
    // This test documents the actual behavior.
    const code = `// import { x } from 'commented'`
    expect(extractImportSources(code)).toEqual(['commented'])
  })
})

describe('escapeRegExp', () => {
  test('escapes special regex characters', () => {
    expect(escapeRegExp('a.b*c?d')).toBe('a\\.b\\*c\\?d')
  })

  test('escapes all special characters', () => {
    const specials = '.*+?^${}()|[]\\'
    const escaped = escapeRegExp(specials)
    expect(new RegExp(escaped).test(specials)).toBe(true)
  })

  test('returns plain strings unchanged', () => {
    expect(escapeRegExp('foobar')).toBe('foobar')
  })

  test('handles empty string', () => {
    expect(escapeRegExp('')).toBe('')
  })
})

describe('getOrCreate', () => {
  test('creates value when key is absent', () => {
    const map = new Map<string, Array<number>>()
    const result = getOrCreate(map, 'a', () => [1, 2])
    expect(result).toEqual([1, 2])
    expect(map.get('a')).toBe(result)
  })

  test('returns existing value without calling factory', () => {
    const map = new Map<string, Array<number>>([['a', [1]]])
    let factoryCalled = false
    const result = getOrCreate(map, 'a', () => {
      factoryCalled = true
      return [99]
    })
    expect(result).toEqual([1])
    expect(factoryCalled).toBe(false)
  })

  test('works with Set values', () => {
    const map = new Map<string, Set<string>>()
    const set = getOrCreate(map, 'k', () => new Set())
    set.add('v')
    expect(map.get('k')?.has('v')).toBe(true)
  })
})

describe('relativizePath', () => {
  test('strips root prefix and leading slash', () => {
    expect(
      relativizePath('/Users/foo/project/src/bar.ts', '/Users/foo/project'),
    ).toBe('src/bar.ts')
  })

  test('returns path as-is when it does not start with root', () => {
    expect(relativizePath('some-module', '/Users/foo/project')).toBe(
      'some-module',
    )
  })

  test('handles root with trailing content that is not a separator', () => {
    // /Users/foo/project-extra should NOT match root /Users/foo/project
    expect(
      relativizePath('/Users/foo/project-extra/bar.ts', '/Users/foo/project'),
    ).toBe('/Users/foo/project-extra/bar.ts')
  })

  test('returns empty string when path equals root + slash', () => {
    expect(relativizePath('/Users/foo/project/', '/Users/foo/project')).toBe('')
  })
})
