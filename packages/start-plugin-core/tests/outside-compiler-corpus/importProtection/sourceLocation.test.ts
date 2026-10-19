/**
 * Internal control (SPEC §8, V1 ip S14/S24): not part of the compiler test
 * corpus. It calls exported internals of import protection's location
 * lookup (source picking, line index, import index, map normalisation,
 * code snippet, location cache) and gives no clause coverage; a correct
 * rewrite may drop it. Where real apps report a violation, with which code
 * frame, is checked on real reports
 * (integration/importProtection/reported-location.test.ts, which has the
 * import forms of this file: dynamic import with attributes, re-exports).
 * The rows that accepted any offset or any caret are deleted (S14).
 */
import { describe, expect, test } from 'vitest'
import {
  ImportLocCache,
  buildCodeSnippet,
  buildLineIndex,
  createImportSpecifierLocationIndex,
  findPostCompileUsageLocation,
  normalizeSourceMap,
  pickOriginalCodeFromSourcesContent,
} from '../../../src/import-protection/sourceLocation'
import type {
  SourceMapLike,
  TransformResult,
  TransformResultProvider,
} from '../../../src/import-protection/sourceLocation'

function makeTransformResult(code: string): TransformResult {
  return {
    code,
    map: undefined,
    originalCode: undefined,
  }
}

describe('pickOriginalCodeFromSourcesContent', () => {
  test('picks exact matching source by path', () => {
    const map = {
      version: 3,
      sources: ['src/a.ts', 'src/b.ts'],
      names: [],
      mappings: '',
      sourcesContent: ['A', 'B'],
    } satisfies SourceMapLike

    const picked = pickOriginalCodeFromSourcesContent(
      map,
      '/project/src/b.ts',
      '/project',
    )

    expect(picked).toBe('B')
  })

  test('falls back to sourcesContent[0] when no match exists', () => {
    const map = {
      version: 3,
      sources: ['src/a.ts'],
      names: [],
      mappings: '',
      sourcesContent: ['A'],
    } satisfies SourceMapLike

    const picked = pickOriginalCodeFromSourcesContent(
      map,
      '/project/src/does-not-exist.ts',
      '/project',
    )

    expect(picked).toBe('A')
  })

  test('returns undefined when map is undefined', () => {
    expect(
      pickOriginalCodeFromSourcesContent(undefined, '/a.ts', '/'),
    ).toBeUndefined()
  })

  test('returns undefined when sourcesContent is missing', () => {
    const map = {
      version: 3,
      sources: ['a.ts'],
      names: [],
      mappings: '',
    } satisfies SourceMapLike

    expect(
      pickOriginalCodeFromSourcesContent(map, '/a.ts', '/'),
    ).toBeUndefined()
  })

  test('returns undefined when sources array is empty', () => {
    const map = {
      version: 3,
      sources: [],
      names: [],
      mappings: '',
      sourcesContent: [],
    } satisfies SourceMapLike

    expect(
      pickOriginalCodeFromSourcesContent(map, '/a.ts', '/'),
    ).toBeUndefined()
  })

  test('picks best suffix-matching source when no exact match', () => {
    const map = {
      version: 3,
      sources: ['../lib/util.ts', '../routes/page.tsx'],
      names: [],
      mappings: '',
      sourcesContent: ['UTIL', 'PAGE'],
    } satisfies SourceMapLike

    const picked = pickOriginalCodeFromSourcesContent(
      map,
      '/project/src/routes/page.tsx',
      '/project',
    )

    expect(picked).toBe('PAGE')
  })

  test('skips null entries in sourcesContent', () => {
    const map = {
      version: 3,
      sources: ['src/a.ts', 'src/b.ts'],
      names: [],
      mappings: '',
      sourcesContent: [null, 'B'],
    } satisfies SourceMapLike

    const picked = pickOriginalCodeFromSourcesContent(
      map,
      '/project/src/a.ts',
      '/project',
    )

    expect(picked).toBeUndefined()
  })
})

describe('buildLineIndex', () => {
  test('single line — one offset at 0', () => {
    const idx = buildLineIndex('hello')
    expect(idx.offsets).toEqual([0])
  })

  test('multiple lines', () => {
    const idx = buildLineIndex('a\nb\nc')
    // Lines start at offsets 0, 2, 4
    expect(idx.offsets).toEqual([0, 2, 4])
  })

  test('empty string', () => {
    const idx = buildLineIndex('')
    expect(idx.offsets).toEqual([0])
  })

  test('trailing newline', () => {
    const idx = buildLineIndex('a\n')
    expect(idx.offsets).toEqual([0, 2])
  })
})

describe('createImportSpecifierLocationIndex', () => {
  test('returns -1 when source is absent', () => {
    const finder = createImportSpecifierLocationIndex()
    expect(
      finder.find(makeTransformResult('const x = 1'), './secret.server'),
    ).toBe(-1)
  })

  test('finds specifier locations in decorated modules', () => {
    const finder = createImportSpecifierLocationIndex()
    const code = [
      `@sealed class Example {}`,
      `import { value } from './secret.server'`,
    ].join('\n')

    expect(finder.find(makeTransformResult(code), './secret.server')).toBe(
      code.indexOf('./secret.server'),
    )
  })

  test('returns earliest occurrence when the same specifier appears multiple times', () => {
    const finder = createImportSpecifierLocationIndex()
    const code = [
      `export * from './secret.server'`,
      `import { getSecret } from './secret.server'`,
      `const later = import('./secret.server')`,
    ].join('\n')

    const idx = finder.find(makeTransformResult(code), './secret.server')
    expect(idx).toBe(code.indexOf('./secret.server'))
  })
})

describe('normalizeSourceMap', () => {
  test('normalizes sourcemap version, file, names, and sourcesContent', () => {
    const normalized = normalizeSourceMap({
      version: '3',
      sources: ['src/a.ts'],
      names: undefined as unknown as Array<string>,
      sourcesContent: [null, 'A'],
      mappings: '',
    })

    expect(normalized).toEqual({
      version: 3,
      file: '',
      sources: ['src/a.ts'],
      names: [],
      sourcesContent: ['', 'A'],
      mappings: '',
    })
  })

  test('returns undefined for missing map', () => {
    expect(normalizeSourceMap(undefined)).toBeUndefined()
    expect(normalizeSourceMap(null)).toBeUndefined()
  })
})

describe('buildCodeSnippet', () => {
  function makeProvider(
    code: string,
    originalCode?: string,
  ): TransformResultProvider {
    return {
      getTransformResult: () => ({
        code,
        map: undefined,
        originalCode,
      }),
    }
  }

  test('builds snippet with context lines around target', () => {
    const code = ['line1', 'line2', 'line3', 'line4', 'line5'].join('\n')
    const provider = makeProvider(code)
    const snippet = buildCodeSnippet(provider, '/test.ts', {
      line: 3,
      column: 1,
    })

    expect(snippet).toBeDefined()
    expect(snippet!.highlightLine).toBe(3)
    expect(snippet!.lines.length).toBeGreaterThanOrEqual(5)
    const markerLine = snippet!.lines.find((l) => l.startsWith('  >'))
    expect(markerLine).toContain('line3')
  })

  test('uses originalCode over transformed code when available', () => {
    const provider = makeProvider('transformed', 'original line 1')
    const snippet = buildCodeSnippet(provider, '/test.ts', {
      line: 1,
      column: 1,
    })

    expect(snippet).toBeDefined()
    const content = snippet!.lines.join('\n')
    expect(content).toContain('original line 1')
    expect(content).not.toContain('transformed')
  })

  test('returns undefined when no transform result', () => {
    const provider: TransformResultProvider = {
      getTransformResult: () => undefined,
    }
    expect(
      buildCodeSnippet(provider, '/test.ts', { line: 1, column: 1 }),
    ).toBeUndefined()
  })

  test('returns undefined when target line is out of range', () => {
    const provider = makeProvider('one line')
    expect(
      buildCodeSnippet(provider, '/test.ts', { line: 999, column: 1 }),
    ).toBeUndefined()
  })

  test('location string includes file:line:col', () => {
    const provider = makeProvider('code')
    const snippet = buildCodeSnippet(provider, '/test.ts', {
      line: 1,
      column: 5,
    })

    expect(snippet!.location).toBe('/test.ts:1:5')
  })

  test('respects custom contextLines parameter', () => {
    const code = Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join('\n')
    const provider = makeProvider(code)
    const snippet = buildCodeSnippet(
      provider,
      '/test.ts',
      { line: 10, column: 1 },
      1,
    )

    expect(snippet).toBeDefined()
    expect(snippet!.lines.length).toBe(4)
  })
})

describe('findPostCompileUsageLocation', () => {
  test('locates the use of each of two denied sources of a module', async () => {
    const result: TransformResult = {
      code: [
        `import { a } from 'denied-a'`,
        `import { b } from 'denied-b'`,
        `export const one = a`,
        `export const two = b`,
      ].join('\n'),
      map: undefined,
      originalCode: undefined,
    }
    const provider: TransformResultProvider = {
      getTransformResult: () => result,
    }
    const id = '/test/src/a.ts'
    expect(
      (await findPostCompileUsageLocation(provider, id, 'denied-a'))?.line,
    ).toBe(3)
    expect(
      (await findPostCompileUsageLocation(provider, id, 'denied-b'))?.line,
    ).toBe(4)
  })
})

describe('ImportLocCache', () => {
  test('stores and retrieves values', () => {
    const cache = new ImportLocCache()
    const entry = { line: 1, column: 1 }
    cache.set('/a.ts::./b', entry)
    expect(cache.get('/a.ts::./b')).toBe(entry)
    expect(cache.has('/a.ts::./b')).toBe(true)
  })

  test('returns undefined for missing keys', () => {
    const cache = new ImportLocCache()
    expect(cache.get('/missing::./b')).toBeUndefined()
    expect(cache.has('/missing::./b')).toBe(false)
  })

  test('stores null values (negative cache)', () => {
    const cache = new ImportLocCache()
    cache.set('/a.ts::./b', null)
    expect(cache.has('/a.ts::./b')).toBe(true)
    expect(cache.get('/a.ts::./b')).toBeNull()
  })

  test('deleteByFile removes all entries for a file', () => {
    const cache = new ImportLocCache()
    cache.set('/a.ts::./x', { line: 1, column: 1 })
    cache.set('/a.ts::./y', { line: 2, column: 1 })
    cache.set('/b.ts::./x', { line: 3, column: 1 })

    cache.deleteByFile('/a.ts')

    expect(cache.has('/a.ts::./x')).toBe(false)
    expect(cache.has('/a.ts::./y')).toBe(false)
    expect(cache.has('/b.ts::./x')).toBe(true)
  })

  test('deleteByFile is a no-op for unknown files', () => {
    const cache = new ImportLocCache()
    cache.set('/a.ts::./x', { line: 1, column: 1 })
    cache.deleteByFile('/unknown.ts')
    expect(cache.has('/a.ts::./x')).toBe(true)
  })

  test('clear removes all entries', () => {
    const cache = new ImportLocCache()
    cache.set('/a.ts::./x', { line: 1, column: 1 })
    cache.set('/b.ts::./y', { line: 2, column: 1 })
    cache.clear()
    expect(cache.has('/a.ts::./x')).toBe(false)
    expect(cache.has('/b.ts::./y')).toBe(false)
  })
})
